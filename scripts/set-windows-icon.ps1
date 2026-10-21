param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$Icon)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($Executable)
$artifactRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../artifacts'))+[IO.Path]::DirectorySeparatorChar
if(-not $target.StartsWith($artifactRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Only copied executables inside this project artifacts folder may be branded.'}
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class BitCrushIcon {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr BeginUpdateResource(string file,bool deleteExisting);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateResource(IntPtr handle,IntPtr type,IntPtr name,ushort language,byte[] data,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool EndUpdateResource(IntPtr handle,bool discard);
 public static void Set(string target,string icon) {
  var bytes=File.ReadAllBytes(icon);var reader=new BinaryReader(new MemoryStream(bytes));
  if(reader.ReadUInt16()!=0||reader.ReadUInt16()!=1)throw new InvalidDataException("Invalid ICO");
  ushort count=reader.ReadUInt16();var group=new MemoryStream();var writer=new BinaryWriter(group);
  writer.Write((ushort)0);writer.Write((ushort)1);writer.Write(count);
  IntPtr handle=BeginUpdateResource(target,false);if(handle==IntPtr.Zero)throw new Win32Exception();
  bool complete=false;
  try {
   for(int n=0;n<count;n++){
    reader.BaseStream.Position=6+n*16;var descriptor=reader.ReadBytes(12);uint offset=reader.ReadUInt32();uint size=BitConverter.ToUInt32(descriptor,8);
    if((ulong)offset+size>(ulong)bytes.Length)throw new InvalidDataException("Invalid ICO image range");
    var image=new byte[size];Array.Copy(bytes,(int)offset,image,0,(int)size);ushort id=(ushort)(101+n);
    if(!UpdateResource(handle,(IntPtr)3,(IntPtr)id,1033,image,size))throw new Win32Exception();
    writer.Write(descriptor);writer.Write(id);
   }
   var data=group.ToArray();if(!UpdateResource(handle,(IntPtr)14,(IntPtr)1,1033,data,(uint)data.Length))throw new Win32Exception();
   complete=true;
  }finally{if(!EndUpdateResource(handle,!complete)&&complete)throw new Win32Exception();}
 }
}
'@
[BitCrushIcon]::Set($target,[IO.Path]::GetFullPath($Icon))
