using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;

namespace Hashbrown.Conformance.Testing;

/// <summary>Opt-in bounded evidence of actual upstream acknowledgement bytes; never creates events or forces an early flush.</summary>
public sealed class FixtureAcknowledgement
{
    private long _bytes;
    private int _started;
    /// <summary>Installs a fixture-only body observer. Default fixture behavior is unchanged unless explicitly enabled.</summary>
    public void Map(WebApplication app)
    {
        app.MapGet("/__test/acknowledgement", () => Results.Json(new { bytes = Interlocked.Read(ref _bytes), started = Volatile.Read(ref _started) }));
        app.Use(async (context, next) =>
        {
            if (context.Request.Path != "/run") { await next(context); return; }
            Interlocked.Exchange(ref _bytes, 0);
            Interlocked.Exchange(ref _started, 0);
            var original = context.Features.Get<IHttpResponseBodyFeature>()!;
            var stream = new NativeStream(original.Stream, this);
            context.Features.Set<IHttpResponseBodyFeature>(new StreamResponseBodyFeature(stream, original));
            try { await next(context); }
            finally { context.Features.Set(original); }
        });
    }

    private sealed class NativeStream(Stream target, FixtureAcknowledgement evidence) : Stream
    {
        private readonly List<byte> _frame = [];
        private int _newlines;
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
            Interlocked.Add(ref evidence._bytes, buffer.Length);
            await target.WriteAsync(buffer, cancellationToken);
            for (var index = 0; index < buffer.Length; index++)
            {
                var value = buffer.Span[index];
                if (value == 10) _newlines++; else if (value != 13) _newlines = 0;
                _frame.Add(value);
                if (_frame.Count > 64 * 1024) { _frame.Clear(); _newlines = 0; }
                if (value != 10 || _newlines < 2) continue;
                var text = System.Text.Encoding.UTF8.GetString(_frame.ToArray());
                foreach (var line in text.Split('\n').Where(line => line.StartsWith("data:", StringComparison.Ordinal)))
                {
                    try
                    {
                        using var item = JsonDocument.Parse(line[5..]);
                        if (item.RootElement.TryGetProperty("type", out var type) && type.GetString() == "RUN_STARTED")
                        { Interlocked.Increment(ref evidence._started); }
                    }
                    catch (JsonException) { }
                }
                _frame.Clear(); _newlines = 0;
            }
        }
    }
}
