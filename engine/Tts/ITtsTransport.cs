using Orbspeak.Shared;

namespace Orbspeak.Engine.Tts;

internal sealed class TtsTransportResult
{
    public byte[] Wav { get; init; } = Array.Empty<byte>();
    public bool InstructionApplied { get; init; }
}

internal interface ITtsTransport
{
    Task<TtsTransportResult> SendAsync(PlannedTtsCall call, CancellationToken cancellationToken);
}

internal interface ISentencePlayer
{
    Task PlayAsync(byte[] wav, CancellationToken cancellationToken);
    void Pause();
    void Resume();
    void Stop();
}
