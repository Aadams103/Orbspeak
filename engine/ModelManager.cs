namespace Orbspeak.Engine;

/// <summary>
/// Central coordinator for ASR/TTS models with simple RAM/VRAM budgeting.
/// This is intentionally backend-agnostic; concrete loaders live elsewhere.
/// </summary>
public sealed class ModelManager
{
    private readonly EngineConfig _config;

    // For now we only track coarse-grained usage; later we can add per-model sizes.
    public int CurrentRamMb { get; private set; }
    public int CurrentVramMb { get; private set; }

    public ModelManager(EngineConfig config)
    {
        _config = config;
    }

    public bool CanLoadModel(int ramCostMb, int vramCostMb)
    {
        return CurrentRamMb + ramCostMb <= _config.RamBudgetMb
            && CurrentVramMb + vramCostMb <= _config.VramBudgetMb;
    }

    public void RegisterModelLoaded(int ramCostMb, int vramCostMb)
    {
        CurrentRamMb += ramCostMb;
        CurrentVramMb += vramCostMb;
    }

    public void RegisterModelUnloaded(int ramCostMb, int vramCostMb)
    {
        CurrentRamMb = Math.Max(0, CurrentRamMb - ramCostMb);
        CurrentVramMb = Math.Max(0, CurrentVramMb - vramCostMb);
    }
}

