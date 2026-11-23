using System.Runtime.InteropServices;
using System.Runtime.InteropServices.Marshalling;

namespace TradingAgent.Platform.Windows.Interop;

// Source-generated COM: the classic [ComImport] interop is unavailable under Native AOT.
//
// Methods must appear in vtable order. Slots this app never calls keep their position with a
// parameterless signature; calling one of those would corrupt the stack, so they are named "Unused".

[GeneratedComInterface(StringMarshalling = StringMarshalling.Utf16)]
[Guid("000214F9-0000-0000-C000-000000000046")]
internal partial interface IShellLinkW
{
    [PreserveSig]
    int UnusedGetPath();

    [PreserveSig]
    int UnusedGetIdList();

    [PreserveSig]
    int UnusedSetIdList();

    [PreserveSig]
    int UnusedGetDescription();

    void SetDescription(string description);

    [PreserveSig]
    int UnusedGetWorkingDirectory();

    void SetWorkingDirectory(string directory);

    [PreserveSig]
    int UnusedGetArguments();

    void SetArguments(string arguments);

    [PreserveSig]
    int UnusedGetHotkey();

    [PreserveSig]
    int UnusedSetHotkey();

    [PreserveSig]
    int UnusedGetShowCmd();

    [PreserveSig]
    int UnusedSetShowCmd();

    [PreserveSig]
    int UnusedGetIconLocation();

    void SetIconLocation(string iconPath, int iconIndex);

    [PreserveSig]
    int UnusedSetRelativePath();

    [PreserveSig]
    int UnusedResolve();

    void SetPath(string file);
}

[GeneratedComInterface(StringMarshalling = StringMarshalling.Utf16)]
[Guid("0000010b-0000-0000-C000-000000000046")]
internal partial interface IPersistFile
{
    // IPersist
    [PreserveSig]
    int UnusedGetClassId();

    [PreserveSig]
    int UnusedIsDirty();

    [PreserveSig]
    int UnusedLoad();

    void Save(string fileName, [MarshalAs(UnmanagedType.Bool)] bool remember);

    [PreserveSig]
    int UnusedSaveCompleted();

    [PreserveSig]
    int UnusedGetCurFile();
}

internal static partial class ShellLinkFactory
{
    private const uint ClsctxInprocServer = 1;

    private static readonly Guid _shellLinkClass = new("00021401-0000-0000-C000-000000000046");
    private static readonly Guid _shellLinkInterface = new("000214F9-0000-0000-C000-000000000046");
    private static readonly StrategyBasedComWrappers _comWrappers = new();

    public static IShellLinkW Create()
    {
        Marshal.ThrowExceptionForHR(
            CoCreateInstance(_shellLinkClass, 0, ClsctxInprocServer, _shellLinkInterface, out var pointer));
        try
        {
            return (IShellLinkW)_comWrappers.GetOrCreateObjectForComInstance(pointer, CreateObjectFlags.None);
        }
        finally
        {
            // The wrapper holds its own reference.
            Marshal.Release(pointer);
        }
    }

    [LibraryImport("ole32.dll")]
    private static partial int CoCreateInstance(
        in Guid classId, nint outer, uint context, in Guid interfaceId, out nint instance);
}
