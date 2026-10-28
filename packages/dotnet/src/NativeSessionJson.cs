using System.Text.Json;

namespace Hashbrown.AspNetCore;

/// <summary>Bounds serialized native arguments before materializing an independently owned JSON document.</summary>
internal static class NativeSessionJson
{
  /// <summary>Serializes an object through a bounded buffer and clones only a complete within-limit object.</summary>
  internal static JsonElement SerializeArguments(object value, int maximumBytes)
  {
    if (maximumBytes < 1) throw new ArgumentOutOfRangeException(nameof(maximumBytes));
    using var buffer = new BoundedBuffer(maximumBytes);
    JsonSerializer.Serialize(buffer, value);
    using var document = JsonDocument.Parse(buffer.GetBuffer().AsMemory(0, checked((int)buffer.Length)));
    if (document.RootElement.ValueKind != JsonValueKind.Object) throw new ArgumentException("Native arguments must be an object.");
    return document.RootElement.Clone();
  }
  private sealed class BoundedBuffer(int maximumBytes) : Stream
  {
    private readonly MemoryStream _buffer = new();
    public override bool CanRead => false;
    public override bool CanSeek => false;
    public override bool CanWrite => true;
    public override long Length => _buffer.Length;
    public override long Position { get => _buffer.Position; set => throw new NotSupportedException(); }
    internal byte[] GetBuffer() => _buffer.GetBuffer();
    public override void Flush() => _buffer.Flush();
    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => Write(buffer.AsSpan(offset, count));
    public override void Write(ReadOnlySpan<byte> buffer)
    {
      if (buffer.Length > maximumBytes - Length) throw new ArgumentException("Native arguments exceed their serialized byte limit.");
      _buffer.Write(buffer);
    }
    protected override void Dispose(bool disposing)
    {
      if (disposing) _buffer.Dispose();
      base.Dispose(disposing);
    }
  }
}
