using System.Data.Common;
using System.IO.Pipelines;
using Microsoft.AspNetCore.Http.Features;

namespace Hashbrown.AspNetCore;

/// <summary>Holds genuine native terminal bytes across upstream save and owned publication; never waits for save inside a write.</summary>
internal sealed class NativeSessionTerminalResult(IResult inner, NativeSessionContext request) : IResult
{
  public async Task ExecuteAsync(HttpContext context)
  {
    var original = context.Features.Get<IHttpResponseBodyFeature>();
    NativeBodyFeature? body = null;
    try
    {
      if (original is null) throw new InvalidOperationException("Response body feature is unavailable.");
      using var evidence = ResponsesRecoveryEvidence.Begin(request.Registration.Options.PublicBytes, request.Registration.Options.MaximumMessages);
      var projection = new NativeSessionProjection(request.PublicRequest, (request.Input.Tools ?? []).Select(tool => tool.Name).ToHashSet(StringComparer.Ordinal),
          request.Registration.Options.PublicBytes, request.Registration.Options.MaximumMessages,
          evidence: new NativeSessionProjectionEvidence(evidence.Matches, evidence.MatchesCall, () => evidence.Available, ownedCall: request.MatchesOwnedCall, approvals: request.ProjectionApprovals)
          { CompletedAnonymousCall = request.Recovery is null ? null : request.MatchesCompletedCapturedCall });
      request.Projection = projection;
      body = new NativeBodyFeature(original, projection, request);
      context.Features.Set<IHttpResponseBodyFeature>(body);
      await inner.ExecuteAsync(context);
      await body.FlushWriterAsync();
      projection.Complete();
      var receipt = request.Receipt;
      if (receipt is null || !projection.Result.Available || !await request.Registration.Journal.AuthorizePublicationAsync(receipt, request.Cancellation))
        throw new NativeSessionRequestException(409);
      // The durable reservation owns this bounded write even when the SDK closes its reader on RUN_FINISHED.
      using var publication = new CancellationTokenSource(TimeSpan.FromSeconds(5));
      await projection.ReleaseTerminalAsync(async bytes => await original.Stream.WriteAsync(bytes, publication.Token), publication.Token);
      await original.Stream.FlushAsync(publication.Token);
      // Successful transport completion must not lose its bookkeeping when the SDK closes its reader on RUN_FINISHED.
      using var finalization = new CancellationTokenSource(TimeSpan.FromSeconds(3));
      if (!await request.Registration.Journal.FinalizePublicationAsync(receipt, finalization.Token)) throw new NativeSessionRequestException(409);
    }
    catch (Exception exception) when (exception is NativeSessionRequestException or DbException or TimeoutException)
    {
      context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("NativeSessionTerminal").LogWarning(exception, "Native terminal publication failed; completion is withheld.");
      if (!context.Response.HasStarted) context.Response.StatusCode = exception is NativeSessionRequestException failure ? failure.Status : 503;
      else context.Abort();
    }
    catch { context.Abort(); throw; }
    finally
    {
      if (original is not null) context.Features.Set(original);
      try { if (body is not null) await body.DisposeAsync(); }
      catch (Exception exception) { context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("NativeSessionBody").LogWarning(exception, "Native body cleanup failed; request bookkeeping still runs."); }
      finally { await request.DisposeAsync(); }
    }
  }
  private sealed class NativeBodyFeature : IHttpResponseBodyFeature, IAsyncDisposable
  {
    private readonly IHttpResponseBodyFeature _original;
    private readonly NativeSessionContext _request;
    private readonly ObservingStream _stream;
    private NativePipeWriter? _writer;
    internal NativeBodyFeature(IHttpResponseBodyFeature original, NativeSessionProjection projection, NativeSessionContext request)
    { _original = original; _request = request; _stream = new ObservingStream(original.Stream, projection, request); }
    public Stream Stream => _stream;
    public PipeWriter Writer => _writer ??= new NativePipeWriter(PipeWriter.Create(_stream, new StreamPipeWriterOptions(leaveOpen: true)));
    public void DisableBuffering() => _original.DisableBuffering();
    public Task StartAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task SendFileAsync(string path, long offset, long? count, CancellationToken cancellationToken = default) => throw new NotSupportedException("Native AG-UI streams do not send files.");
    public async Task CompleteAsync() { await FlushWriterAsync(); }
    internal async ValueTask FlushWriterAsync()
    {
      if (_writer is null) return;
      if (_writer.Failure is { } failure) throw new IOException("Native body writer failed before publication.", failure);
      if (_writer.Completed) return;
      var flushed = await _writer.FlushAsync(_request.Cancellation);
      if (flushed.IsCanceled) throw new OperationCanceledException(_request.Cancellation);
    }
    public async ValueTask DisposeAsync() { if (_writer is not null) await _writer.CompleteAsync(); }
  }
  private sealed class NativePipeWriter(PipeWriter inner) : PipeWriter
  {
    internal bool Completed { get; private set; }
    internal Exception? Failure { get; private set; }
    public override void Advance(int bytes) => inner.Advance(bytes);
    public override void CancelPendingFlush() => inner.CancelPendingFlush();
    public override Memory<byte> GetMemory(int sizeHint = 0) => inner.GetMemory(sizeHint);
    public override Span<byte> GetSpan(int sizeHint = 0) => inner.GetSpan(sizeHint);
    public override ValueTask<FlushResult> FlushAsync(CancellationToken cancellationToken = default) => inner.FlushAsync(cancellationToken);
    public override void Complete(Exception? exception = null)
    {
      if (Completed) return;
      Completed = true; Failure = exception;
      inner.Complete(exception);
    }
    public override ValueTask CompleteAsync(Exception? exception = null)
    {
      if (Completed) return ValueTask.CompletedTask;
      Completed = true; Failure = exception;
      return inner.CompleteAsync(exception);
    }
  }
  private sealed class ObservingStream(Stream target, NativeSessionProjection projection, NativeSessionContext request) : Stream
  {
    public override bool CanRead => false;
    public override bool CanSeek => false;
    public override bool CanWrite => true;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override void Flush() { if (request.Bound) target.Flush(); }
    public override Task FlushAsync(CancellationToken cancellationToken) => request.Bound ? target.FlushAsync(cancellationToken) : Task.CompletedTask;
    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => WriteAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
    public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) => WriteAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();
    public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default) =>
        projection.ObserveAsync(buffer, async bytes => await target.WriteAsync(bytes, request.Cancellation), request.Cancellation);
  }
}
