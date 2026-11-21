# JXL Optimizer Web - compression engine

This directory contains the C++ wrapper and the reproducible build scripts for
the WebAssembly JPEG XL engine. The generated `.js` / `.wasm` files live in
`public/wasm/` and are committed so the site can be built without Emscripten.

## Pinned version

- libjxl: `v0.11.2` (security-maintained branch; matches the desktop reference
  `cjxl 0.11.2`).
- Emscripten: `3.1.74`.
- SIMD: standard build (`-msimd128` build).

## Wrapper (`wrapper/jxl_engine.cpp`)

Exposes a small C ABI:

- `jxl_encode_rgba` - RGBA/RGB pixels -> JXL codestream (Distance, Effort,
  lossless flag).
- `jxl_encode_jpeg` - JPEG bitstream -> reversible JXL (`JxlEncoderStoreJPEGMetadata`
  + `JxlEncoderAddJPEGFrame`, container format).
- `jxl_decode` - JXL -> 8-bit sRGB pixels (used for verification).
- `jxl_reconstruct_jpeg` - JXL -> original JPEG bytes (exact byte comparison).
- `jxl_free` / `jxl_last_error` / `jxl_engine_version`.

All results are `malloc`'d and ownership is transferred to JavaScript, which
frees them after copying. This keeps per-image cleanup simple in the worker.

## Build

```bash
# from the project root
npm run build:wasm
```

The script clones libjxl, builds both the standard and the SIMD variants and
copies the four files to `public/wasm/`. Set `EMSDK_DIR` or `LIBJXL_DIR` to
override the default locations (`/root/opt/emsdk` and `/root/opt/libjxl-0.11.2`).

## Limitations

- Single-threaded only (no SharedArrayBuffer / special HTTP headers).
- 8-bit sRGB path for pixel modes; see the main README.
- Maximum codestream level 5 (268,435,456 pixels).
