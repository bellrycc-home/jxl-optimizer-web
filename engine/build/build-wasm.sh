#!/usr/bin/env bash
# Reproducible WebAssembly build for the JXL Optimizer Web engine.
#
# Prerequisites:
#   * Emscripten SDK 3.1.74+ installed and activated (EMSDK_DIR).
#   * cmake, ninja-build, git, python3.
#
# Usage (from the project root):
#   npm run build:wasm
#   # or
#   bash engine/build/build-wasm.sh
#
# The script clones libjxl v0.11.2 into LIBJXL_DIR if it is missing and
# builds both the standard and the SIMD WebAssembly modules into public/wasm/.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EMSDK_DIR="${EMSDK_DIR:-${EMSDK:-/root/opt/emsdk}}"
LIBJXL_VERSION="${LIBJXL_VERSION:-v0.11.2}"
LIBJXL_DIR="${LIBJXL_DIR:-/root/opt/libjxl-0.11.2}"
BUILD_ROOT="${BUILD_ROOT:-${PROJECT_ROOT}/engine/build}"
OUTPUT_DIR="${OUTPUT_DIR:-${PROJECT_ROOT}/public/wasm}"

if [[ ! -f "${EMSDK_DIR}/emsdk_env.sh" ]]; then
  echo "ERROR: Emscripten SDK not found at ${EMSDK_DIR}." >&2
  echo "Install it following https://emscripten.org/docs/getting_started/downloads.html" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "${EMSDK_DIR}/emsdk_env.sh" >/dev/null

for tool in emcc cmake ninja git; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "ERROR: missing required tool '${tool}'." >&2
    exit 1
  fi
done

if [[ ! -d "${LIBJXL_DIR}/.git" ]]; then
  echo "Cloning libjxl ${LIBJXL_VERSION} into ${LIBJXL_DIR}..."
  mkdir -p "$(dirname "${LIBJXL_DIR}")"
  git clone --depth 1 --branch "${LIBJXL_VERSION}" \
    https://github.com/libjxl/libjxl.git "${LIBJXL_DIR}"
  git -C "${LIBJXL_DIR}" submodule update --init --depth 1 \
    third_party/brotli third_party/highway third_party/skcms
fi

mkdir -p "${OUTPUT_DIR}" "${BUILD_ROOT}"

COMMON_CMAKE_ARGS=(
  -DBUILD_TESTING=OFF
  -DJPEGXL_ENABLE_TOOLS=OFF
  -DJPEGXL_ENABLE_DOXYGEN=OFF
  -DJPEGXL_ENABLE_MANPAGES=OFF
  -DJPEGXL_ENABLE_BENCHMARK=OFF
  -DJPEGXL_ENABLE_EXAMPLES=OFF
  -DJPEGXL_ENABLE_JNI=OFF
  -DJPEGXL_ENABLE_SJPEG=OFF
  -DJPEGXL_ENABLE_OPENEXR=OFF
  -DJPEGXL_ENABLE_PLUGINS=OFF
  -DJPEGXL_ENABLE_JPEGLI=OFF
  -DJPEGXL_ENABLE_WASM_THREADS=OFF
  -DJPEGXL_ENABLE_SKCMS=ON
  -DJPEGXL_BUNDLE_LIBPNG=OFF
  -DJPEGXL_ENABLE_TRANSCODE_JPEG=ON
  -DJPEGXL_STATIC=ON
)

build_variant() {
  local variant="$1"   # std | simd
  local cmake_flags="$2" # extra C/CXX flags
  local build_dir="${BUILD_ROOT}/wasm-${variant}"
  local out_js="${OUTPUT_DIR}/jxl_engine_${variant}.js"
  local out_wasm="${OUTPUT_DIR}/jxl_engine_${variant}.wasm"

  echo "=== Configuring libjxl (${variant}) ==="
  rm -rf "${build_dir}"
  # shellcheck disable=SC2086
  emcmake cmake -S "${LIBJXL_DIR}" -B "${build_dir}" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_FLAGS="${cmake_flags}" \
    -DCMAKE_CXX_FLAGS="${cmake_flags}" \
    "${COMMON_CMAKE_ARGS[@]}" > "${BUILD_ROOT}/config-${variant}.log" 2>&1

  echo "=== Building libjxl (${variant}) ==="
  ninja -C "${build_dir}" -j"$(nproc)" > "${BUILD_ROOT}/build-${variant}.log" 2>&1

  echo "=== Linking wrapper (${variant}) ==="
  # shellcheck disable=SC2086
  em++ -O3 ${cmake_flags} -std=c++17 -DJXL_STATIC_DEFINE \
    -I"${LIBJXL_DIR}/lib/include" \
    -I"${build_dir}/lib/include" \
    "${PROJECT_ROOT}/engine/wrapper/jxl_engine.cpp" \
    "${build_dir}/lib/libjxl.a" \
    "${build_dir}/lib/libjxl_cms.a" \
    "${build_dir}/third_party/highway/libhwy.a" \
    "${build_dir}/third_party/brotli/libbrotlienc.a" \
    "${build_dir}/third_party/brotli/libbrotlidec.a" \
    "${build_dir}/third_party/brotli/libbrotlicommon.a" \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createJxlEngine \
    -sENVIRONMENT=web,worker -sALLOW_MEMORY_GROWTH=1 \
    -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=2147483648 \
    -sSTACK_SIZE=4194304 -sFILESYSTEM=0 -sASSERTIONS=0 \
    -sNO_EXIT_RUNTIME=1 -sABORTING_MALLOC=0 \
    -sEXPORTED_FUNCTIONS=_jxl_encode_rgba,_jxl_encode_jpeg,_jxl_decode,_jxl_reconstruct_jpeg,_jxl_last_error,_jxl_clear_error,_jxl_engine_version,_jxl_effort_min,_jxl_effort_max,_jxl_free,_malloc,_free \
    -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,HEAPU8,HEAPU32 \
    -o "${out_js}" > "${BUILD_ROOT}/link-${variant}.log" 2>&1

  echo "Built ${out_js} ($(stat -c%s "${out_js}") bytes JS, $(stat -c%s "${out_wasm}") bytes WASM)"
}

build_variant "std" ""
build_variant "simd" "-msimd128"

echo "=== Done ==="
echo "WebAssembly modules are in ${OUTPUT_DIR}"
