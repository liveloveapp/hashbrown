import type { DotnetReference } from './dotnet-reference';

/** Read and validate compiled C# reference input without a .NET SDK. */
export function readReferenceInput(file: string): DotnetReference;
