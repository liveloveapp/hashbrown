using System.Text;
using Microsoft.AspNetCore.Http.Features;

namespace Hashbrown.Conformance.Integration;

/// <summary>Server-local capture authority tied to the accepted token and generation. Never serialize this handle.</summary>
public sealed class CheckpointCaptureHandle
{
    internal InterruptClaim Claim { get; }
    internal string? OriginalRequest { get; }
    internal int MaximumBytes { get; }
    internal int MaximumMessages { get; }
    internal CheckpointCaptureHandle(InterruptClaim claim, string? original, InterruptStoreOptions options)
    { Claim = claim; OriginalRequest = original; MaximumBytes = options.TerminalSnapshotBytes; MaximumMessages = options.MaximumMessages; }
}

internal sealed class CheckpointCaptureResult(IResult inner, IInterruptStore store, InterruptClaim claim) : IResult
{
    public async Task ExecuteAsync(HttpContext context)
    {
        var handle = await store.StartCaptureAsync(claim, context.RequestAborted);
        if (handle is null) { context.Response.StatusCode = 409; return; }
        using var evidence = ResponsesRecoveryEvidence.Begin(handle.MaximumBytes, handle.MaximumMessages);
        var original = context.Features.Get<IHttpResponseBodyFeature>()!;
        var observer = new CheckpointSseObserver(handle, async (outcome, snapshot) =>
        {
            if (!await store.CompleteCaptureAsync(handle, outcome, snapshot, context.RequestAborted))
                throw new InvalidOperationException("Checkpoint capture authority is stale.");
        });
        var stream = new ObservingStream(original.Stream, observer);
        context.Features.Set<IHttpResponseBodyFeature>(new StreamResponseBodyFeature(stream, original));
        try
        {
            await inner.ExecuteAsync(context);
            await observer.FinishAsync(context.RequestAborted);
        }
        finally
        {
            context.Features.Set(original);
            using var budget = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            try { await store.CompleteCaptureAsync(handle, context.RequestAborted.IsCancellationRequested ? "Interrupted" : "Unavailable", null, budget.Token); }
            catch (Exception exception) { context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("CheckpointCapture").LogWarning(exception, "Terminal capture cleanup failed; durable effect state remains retained."); }
        }
    }

    private sealed class ObservingStream(Stream target, CheckpointSseObserver observer) : Stream
    {
        public override bool CanRead => false;
        public override bool CanSeek => false;
        public override bool CanWrite => true;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() => target.Flush();
        public override Task FlushAsync(CancellationToken cancellationToken) => target.FlushAsync(cancellationToken);
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => WriteAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) => WriteAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();
        public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            await observer.ObserveAsync(buffer, async bytes => await target.WriteAsync(bytes, cancellationToken), cancellationToken);
        }
    }
}
