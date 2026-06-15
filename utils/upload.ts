// @/utils/upload.ts
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as mime from "react-native-mime-types";

export type FileAttachment = {
  uri: string;
  name?: string;
  type?: string;
  file?: File; // web only
};

function ensureNameAndType(f: FileAttachment): { name: string; type: string } {
  let name = f.name || f.uri.split("/").pop() || `upload_${Date.now()}`;
  if (!name.includes(".")) name = `${name}.bin`;
  let type = f.type || (mime.lookup(name) as string) || "application/octet-stream";
  return { name, type };
}

/** Try to copy content:// to a file:// in cache (cheapest path) */
async function tryCopyContentUriToCache(srcUri: string, destPath: string) {
  try {
    // Some Android sources support direct copyAsync from content://
    await FileSystem.copyAsync({ from: srcUri, to: destPath });
    return destPath;
  } catch {
    return null;
  }
}

/** Fallback: base64 read+write (works broadly, but uses memory) */
async function tryBase64CopyContentUriToCache(srcUri: string, destPath: string) {
  try {
    const b64 = await FileSystem.readAsStringAsync(srcUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(destPath, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return destPath;
  } catch {
    return null;
  }
}

async function normalizeRNFile(file: FileAttachment) {
  const { name, type } = ensureNameAndType(file);
  let { uri } = file;

  if (Platform.OS === "android" && uri.startsWith("content://")) {
    const dest = `${FileSystem.cacheDirectory}${Date.now()}_${name}`;

    // 1) Fast path: direct copy
    const viaCopy = await tryCopyContentUriToCache(uri, dest);
    if (viaCopy) {
      return { uri: viaCopy, name, type };
    }

    // 2) Fallback: base64
    const viaB64 = await tryBase64CopyContentUriToCache(uri, dest);
    if (viaB64) {
      return { uri: viaB64, name, type };
    }

    // 3) Last resort: keep content:// (some stacks can still upload this)
    console.warn("[upload.normalizeRNFile] Using raw content:// as last resort");
    return { uri, name, type };
  }

  return { uri, name, type };
}

/** Cross-platform append into FormData */
export async function appendFilesCrossPlatform(
  fd: FormData,
  files: FileAttachment[],
  fieldName: string
) {
  for (const f of files) {
    if (Platform.OS === "web") {
      if (f.file instanceof File) {
        fd.append(fieldName, f.file, f.file.name || f.name || `file_${Date.now()}`);
      } else {
        const resp = await fetch(f.uri); // blob from object URL
        const blob = await resp.blob();
        const { name, type } = ensureNameAndType(f);
        const webFile = new File([blob], name, { type: f.type || blob.type || type });
        fd.append(fieldName, webFile);
      }
    } else {
      const n = await normalizeRNFile(f);
      // RN requires exactly { uri, name, type } on native
      fd.append(fieldName, n as any);
    }
  }
}








// // utils/upload.ts

// import { Platform } from 'react-native';
// import * as mime from 'react-native-mime-types';

// export type FileAttachment = {
//   uri: string;          // web: object URL (blob:/… or http(s)://) | native: file:///… or content://
//   name?: string;        // required on native; we’ll fallback if missing
//   type?: string;        // required on native; we’ll infer if missing
//   file?: File;          // web-only: native File when you have it (from input/DocumentPicker polyfills)
// };

// /**
//  * Append files to FormData in a way that works identically on Web, iOS, and Android.
//  * - Web: converts blob/object-URL to a real File (unless you already provided file)
//  * - Native: keeps uri AS-IS (no file:// stripping), ensures name & type are set
//  */
// export async function appendFilesCrossPlatform(
//   formData: FormData,
//   attachments: FileAttachment[],
//   key = 'files'
// ) {
//   for (const f of attachments) {
//     const name = f.name || `file_${Date.now()}`;
//     const guessedType =
//       f.type || (mime.lookup(name) as string) || 'application/octet-stream';

//     if (Platform.OS === 'web') {
//       // If you already have a File object (e.g. from <input type="file">), use it
//       if (f.file instanceof File) {
//         formData.append(key, new File([f.file], name, { type: f.file.type || guessedType }));
//         continue;
//       }

//       // Otherwise, f.uri is likely an object URL — fetch to Blob, then to File
//       const resp = await fetch(f.uri);
//       const blob = await resp.blob();
//       formData.append(key, new File([blob], name, { type: guessedType }));
//     } else {
//       // iOS/Android: DO NOT strip "file://". content:// is fine too.
//       formData.append(key, {
//         uri: f.uri,       // e.g., file:///… or content://…
//         name,             // MUST be present
//         type: guessedType // MUST be present
//       } as any);
//     }
//   }
// }
