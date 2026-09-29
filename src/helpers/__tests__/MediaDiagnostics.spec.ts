import { describe, expect, it } from "vitest";
import {
  mediaSourceDetails,
  mediaElementDetails,
  mediaFormatDetails,
  mediaDiagnosticMessage,
  mediaDiagnosticVideoId,
  mediaBlobDetails,
  mediaLibraryDetails,
} from "../MediaDiagnostics";

describe("bounded media diagnostics", () => {
  it("retains a bounded basename, scheme and extension without paths, credentials or signed queries", () => {
    const source =
      "https://user:password@private.example/Secret%20song.mov?X-Amz-Signature=secret#fragment";
    expect(mediaSourceDetails(source)).toEqual({
      source_present: true,
      source_scheme: "https",
      source_transport: "network",
      file_ext: "mov",
      file_basename: "Secret song.mov",
    });
    expect(mediaSourceDetails("louvorja://onlinestream/id/video")).toEqual({
      source_present: true,
      source_scheme: "louvorja",
      source_transport: "onlinestream",
    });
    expect(mediaSourceDetails("blob:louvorja://app/private-uuid")).toEqual({
      source_present: true,
      source_scheme: "blob",
    });
    expect(mediaSourceDetails("data:video/mp4;base64,PRIVATE_BYTES")).toEqual({
      source_present: true,
      source_scheme: "data",
    });
  });

  it("captures the actual media state and bounded ranges at a source-not-supported failure", () => {
    const el = document.createElement("video");
    el.src = "https://provider.example/private.mov?token=secret";
    Object.defineProperties(el, {
      currentSrc: { value: el.src },
      error: { value: { code: 4, message: `unsupported source ${el.src}` } },
      duration: { value: Infinity },
      buffered: { value: { length: 9, start: (i: number) => i, end: (i: number) => i + 0.123456 } },
      seekable: { value: { length: 1, start: () => 0, end: () => 30 } },
    });
    const details = mediaElementDetails(el);
    expect(details).toMatchObject({
      media_element_kind: "video",
      source_scheme: "https",
      file_ext: "mov",
      media_error_code: 4,
      media_error_message: "unsupported source [source]",
      duration: null,
      current_src_present: true,
      buffered_ranges: [
        [0, 0.123],
        [1, 1.123],
        [2, 2.123],
      ],
      seekable_ranges: [[0, 30]],
    });
    expect(details.file_basename).toBe("private.mov");
    expect(JSON.stringify(details)).not.toMatch(/secret|provider|https:/);
  });

  it("strips arbitrary or unsafe IPC format metadata and accepts only finite bounded fields", () => {
    expect(
      mediaFormatDetails({
        vcodec: "avc1.64002A",
        acodec: "opus",
        ext: "webm",
        height: 1080,
        size: Infinity,
        url: "https://provider?secret=yes",
        extra: { secret: "bytes" },
      })
    ).toEqual({ vcodec: "avc1.64002A", acodec: "opus", ext: "webm", height: 1080 });
    expect(
      mediaFormatDetails({ vcodec: "https://signed/source", ext: "x".repeat(49), width: -1 })
    ).toEqual({ vcodec: "unknown", acodec: "unknown" });
  });

  it("scrubs raw sources from bounded error text and validates diagnostic YouTube ids", () => {
    expect(
      mediaDiagnosticMessage(
        "blocked blob:louvorja://app/id and https://u:p@host/path?signature=secret"
      )
    ).toBe("blocked [source] and [source]");
    expect(mediaDiagnosticMessage("x".repeat(1000))).toHaveLength(240);
    expect(
      mediaDiagnosticMessage("open C:\\Users\\private\\song.mov or /Users/private/song.mov failed")
    ).toBe("open [path] or [path] failed");
    expect(mediaDiagnosticVideoId("https://www.youtube.com/embed/T8YHfGrk3ok?secret=yes")).toBe(
      "T8YHfGrk3ok"
    );
    expect(mediaDiagnosticVideoId("https://www.youtube.com/embed/too_long_identifier")).toBeNull();
  });

  it("keeps actual Blob metadata and safe library references without guessing codecs", () => {
    expect(
      mediaBlobDetails(
        new Blob(["<html>denied</html>"], { type: "text/html" }),
        "text/html; charset=utf-8"
      )
    ).toEqual({
      blob_mime: "text/html",
      blob_bytes: 19,
      response_content_type: "text/html",
      codec: "unknown",
    });
    expect(mediaBlobDetails(new Blob(["x"]), "https://signed?token=secret")).toEqual({
      blob_mime: "unknown",
      blob_bytes: 1,
      response_content_type: "unknown",
      codec: "unknown",
    });
    expect(
      mediaLibraryDetails({ id: "media-123", table: "media_library", secret: "ignored" })
    ).toEqual({
      library_ref_present: true,
      library_id: "media-123",
      library_table: "media_library",
    });
    expect(mediaLibraryDetails({ id: "https://private?secret", table: "/path" })).toEqual({
      library_ref_present: true,
    });
    expect(
      mediaSourceDetails("louvorja://local/C%3A%5CUsers%5Cprivate%5Csong.mov").file_basename
    ).toBe("song.mov");
  });
});
