namespace Hashbrown.Conformance.Testing;

/// <summary>Test-owned clock for deterministic expiration without changing process time.</summary>
public sealed class FixtureClock : TimeProvider
{
    private long _offset;

    /// <inheritdoc />
    public override DateTimeOffset GetUtcNow() => DateTimeOffset.UtcNow.AddTicks(Interlocked.Read(ref _offset));

    /// <summary>Moves all ten-minute fixture checkpoints beyond their lifetime.</summary>
    public void Advance() => Interlocked.Add(ref _offset, TimeSpan.FromMinutes(11).Ticks);
}
