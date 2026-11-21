// JXL Optimizer Web - libjxl WebAssembly wrapper.
//
// This file is intentionally small and stateless: every public function
// allocates its result with malloc() and returns ownership to JavaScript,
// which must release it with jxl_free(). This makes per-image cleanup easy
// and avoids keeping libjxl objects alive between batch items.
//
// Build with engine/build/build-wasm.sh (Emscripten).

#include <jxl/decode.h>
#include <jxl/encode.h>

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

namespace {

constexpr int kMinEffort = 1;
constexpr int kMaxEffort = 10;
constexpr float kMaxDistance = 25.0f;
// Level 5 codestream limit (see libjxl documentation).
constexpr uint64_t kMaxPixels = 268435456ULL;

std::string g_last_error;

void set_error(const std::string& message) { g_last_error = message; }

void clear_error() { g_last_error.clear(); }

struct EncoderDeleter {
  void operator()(JxlEncoder* encoder) const { JxlEncoderDestroy(encoder); }
};

struct DecoderDeleter {
  void operator()(JxlDecoder* decoder) const { JxlDecoderDestroy(decoder); }
};

using EncoderPtr = std::unique_ptr<JxlEncoder, EncoderDeleter>;
using DecoderPtr = std::unique_ptr<JxlDecoder, DecoderDeleter>;

// Copies a std::vector into a malloc'ed buffer owned by the caller.
uint8_t* copy_to_caller(const std::vector<uint8_t>& bytes, size_t* out_size) {
  if (out_size == nullptr) {
    set_error("Puntero de tamaño de salida nulo.");
    return nullptr;
  }
  if (bytes.empty()) {
    set_error("El codificador devolvió una salida vacía.");
    return nullptr;
  }
  auto* result = static_cast<uint8_t*>(std::malloc(bytes.size()));
  if (result == nullptr) {
    set_error("Sin memoria para copiar el resultado.");
    return nullptr;
  }
  std::memcpy(result, bytes.data(), bytes.size());
  *out_size = bytes.size();
  return result;
}

// Runs JxlEncoderProcessOutput until the encoder has produced the complete
// codestream. Returns false and sets the error on failure.
bool process_output(JxlEncoder* encoder, std::vector<uint8_t>* output) {
  constexpr size_t kInitialCapacity = 1u << 20;  // 1 MiB
  output->resize(kInitialCapacity);
  size_t written = 0;
  for (;;) {
    uint8_t* next_out = output->data() + written;
    size_t avail_out = output->size() - written;
    const JxlEncoderStatus status =
        JxlEncoderProcessOutput(encoder, &next_out, &avail_out);
    written = static_cast<size_t>(next_out - output->data());
    if (status == JXL_ENC_SUCCESS) {
      output->resize(written);
      return true;
    }
    if (status != JXL_ENC_NEED_MORE_OUTPUT) {
      set_error("JxlEncoderProcessOutput falló con el estado " +
                std::to_string(static_cast<int>(status)) + ".");
      return false;
    }
    const size_t old_size = output->size();
    output->resize(old_size * 2);
    // next_out/avail_out are recomputed on the next iteration.
  }
}

bool validate_common(uint32_t width, uint32_t height, int effort,
                     bool lossless, float distance) {
  if (width == 0 || height == 0) {
    set_error("Dimensiones de imagen no válidas.");
    return false;
  }
  if (static_cast<uint64_t>(width) * height > kMaxPixels) {
    set_error("La imagen supera el límite de 268435456 píxeles del nivel 5 "
              "de JPEG XL.");
    return false;
  }
  if (effort < kMinEffort || effort > kMaxEffort) {
    set_error("Effort fuera del rango admitido por libjxl (" +
              std::to_string(kMinEffort) + ".." + std::to_string(kMaxEffort) +
              ").");
    return false;
  }
  if (!lossless && !(distance >= 0.0f && distance <= kMaxDistance)) {
    set_error("Distance fuera del rango admitido (0.0..25.0).");
    return false;
  }
  return true;
}

}  // namespace

extern "C" {

const char* jxl_last_error() { return g_last_error.c_str(); }

void jxl_clear_error() { clear_error(); }

const char* jxl_engine_version() { return "libjxl 0.11.2"; }

int jxl_effort_min() { return kMinEffort; }

int jxl_effort_max() { return kMaxEffort; }

void jxl_free(void* pointer) { std::free(pointer); }

// Encodes interleaved 8-bit RGB (channels == 3) or RGBA (channels == 4).
// On success returns a malloc'ed JXL codestream and writes its size to
// out_size. On failure returns nullptr and jxl_last_error() explains why.
uint8_t* jxl_encode_rgba(const uint8_t* pixels, uint32_t width,
                         uint32_t height, uint32_t channels, float distance,
                         int effort, int lossless, size_t* out_size) {
  clear_error();
  if (out_size == nullptr) {
    set_error("Puntero de tamaño de salida nulo.");
    return nullptr;
  }
  *out_size = 0;
  if (pixels == nullptr) {
    set_error("No se recibieron píxeles.");
    return nullptr;
  }
  if (channels != 3 && channels != 4) {
    set_error("El wrapper espera 3 (RGB) o 4 (RGBA) canales.");
    return nullptr;
  }
  const bool is_lossless = lossless != 0;
  if (!validate_common(width, height, effort, is_lossless, distance)) {
    return nullptr;
  }

  EncoderPtr encoder(JxlEncoderCreate(nullptr));
  if (!encoder) {
    set_error("No se pudo crear el codificador JPEG XL (sin memoria).");
    return nullptr;
  }

  JxlEncoderFrameSettings* frame =
      JxlEncoderFrameSettingsCreate(encoder.get(), nullptr);
  if (frame == nullptr) {
    set_error("No se pudo crear la configuración del frame.");
    return nullptr;
  }

  if (JxlEncoderFrameSettingsSetOption(frame, JXL_ENC_FRAME_SETTING_EFFORT,
                                       effort) != JXL_ENC_SUCCESS) {
    set_error("libjxl rechazó el valor de Effort.");
    return nullptr;
  }
  if (!is_lossless &&
      JxlEncoderSetFrameDistance(frame, distance) != JXL_ENC_SUCCESS) {
    set_error("libjxl rechazó el valor de Distance.");
    return nullptr;
  }
  if (is_lossless &&
      JxlEncoderSetFrameLossless(frame, JXL_TRUE) != JXL_ENC_SUCCESS) {
    set_error("libjxl rechazó el modo sin pérdida.");
    return nullptr;
  }

  JxlBasicInfo info;
  JxlEncoderInitBasicInfo(&info);
  info.xsize = width;
  info.ysize = height;
  info.bits_per_sample = 8;
  info.exponent_bits_per_sample = 0;
  info.num_color_channels = 3;
  info.uses_original_profile = is_lossless ? JXL_TRUE : JXL_FALSE;
  info.num_extra_channels = (channels == 4) ? 1 : 0;
  info.alpha_bits = (channels == 4) ? 8 : 0;
  info.alpha_exponent_bits = 0;
  info.alpha_premultiplied = JXL_FALSE;

  if (JxlEncoderSetBasicInfo(encoder.get(), &info) != JXL_ENC_SUCCESS) {
    set_error("libjxl rechazó la información básica de la imagen.");
    return nullptr;
  }

  if (channels == 4) {
    JxlExtraChannelInfo alpha;
    JxlEncoderInitExtraChannelInfo(JXL_CHANNEL_ALPHA, &alpha);
    alpha.bits_per_sample = 8;
    alpha.exponent_bits_per_sample = 0;
    alpha.dim_shift = 0;
    alpha.alpha_premultiplied = JXL_FALSE;
    if (JxlEncoderSetExtraChannelInfo(encoder.get(), 0, &alpha) !=
        JXL_ENC_SUCCESS) {
      set_error("libjxl rechazó el canal alfa.");
      return nullptr;
    }
    // Keep alpha lossless even when the color channels are lossy.
    JxlEncoderSetExtraChannelDistance(frame, 0, 0.0f);
  }

  JxlColorEncoding color;
  JxlColorEncodingSetToSRGB(&color, JXL_FALSE);
  if (JxlEncoderSetColorEncoding(encoder.get(), &color) != JXL_ENC_SUCCESS) {
    set_error("libjxl rechazó el perfil de color sRGB.");
    return nullptr;
  }

  const JxlPixelFormat format = {channels, JXL_TYPE_UINT8, JXL_LITTLE_ENDIAN, 0};
  const size_t pixel_bytes =
      static_cast<size_t>(width) * height * channels;
  if (JxlEncoderAddImageFrame(frame, &format, pixels, pixel_bytes) !=
      JXL_ENC_SUCCESS) {
    set_error("libjxl no pudo aceptar los píxeles de la imagen.");
    return nullptr;
  }
  JxlEncoderCloseInput(encoder.get());

  std::vector<uint8_t> output;
  if (!process_output(encoder.get(), &output)) {
    return nullptr;
  }
  return copy_to_caller(output, out_size);
}

// Lossless JPEG bitstream recompression. The original JPEG bytes can be
// reconstructed exactly (JxlEncoderStoreJPEGMetadata + AddJPEGFrame).
uint8_t* jxl_encode_jpeg(const uint8_t* jpeg, size_t jpeg_size, int effort,
                         size_t* out_size) {
  clear_error();
  if (out_size == nullptr) {
    set_error("Puntero de tamaño de salida nulo.");
    return nullptr;
  }
  *out_size = 0;
  if (jpeg == nullptr || jpeg_size == 0) {
    set_error("No se recibieron bytes JPEG.");
    return nullptr;
  }
  if (effort < kMinEffort || effort > kMaxEffort) {
    set_error("Effort fuera del rango admitido por libjxl.");
    return nullptr;
  }

  EncoderPtr encoder(JxlEncoderCreate(nullptr));
  if (!encoder) {
    set_error("No se pudo crear el codificador JPEG XL (sin memoria).");
    return nullptr;
  }
  if (JxlEncoderUseContainer(encoder.get(), JXL_TRUE) != JXL_ENC_SUCCESS) {
    set_error("No se pudo activar el contenedor JPEG XL.");
    return nullptr;
  }
  if (JxlEncoderStoreJPEGMetadata(encoder.get(), JXL_TRUE) != JXL_ENC_SUCCESS) {
    set_error("No se pudo activar los metadatos de reconstrucción JPEG.");
    return nullptr;
  }

  JxlEncoderFrameSettings* frame =
      JxlEncoderFrameSettingsCreate(encoder.get(), nullptr);
  if (frame == nullptr) {
    set_error("No se pudo crear la configuración del frame JPEG.");
    return nullptr;
  }
  if (JxlEncoderFrameSettingsSetOption(frame, JXL_ENC_FRAME_SETTING_EFFORT,
                                       effort) != JXL_ENC_SUCCESS) {
    set_error("libjxl rechazó el valor de Effort.");
    return nullptr;
  }
  if (JxlEncoderAddJPEGFrame(frame, jpeg, jpeg_size) != JXL_ENC_SUCCESS) {
    const JxlEncoderError code = JxlEncoderGetError(encoder.get());
    if (code == JXL_ENC_ERR_BAD_INPUT) {
      set_error("El JPEG no es válido o usa un tipo no admitido (por ejemplo "
                "CMYK). Prueba el modo con pérdida.");
    } else if (code == JXL_ENC_ERR_JBRD) {
      set_error("No se pudieron crear los datos de reconstrucción JPEG "
                "(JBRD). Prueba el modo con pérdida.");
    } else {
      set_error("libjxl no pudo recompilar el JPEG de forma reversible.");
    }
    return nullptr;
  }
  JxlEncoderCloseInput(encoder.get());

  std::vector<uint8_t> output;
  if (!process_output(encoder.get(), &output)) {
    return nullptr;
  }
  return copy_to_caller(output, out_size);
}

// Decodes a JXL codestream to interleaved 8-bit RGB or RGBA. The preferred
// output profile is sRGB. On success writes dimensions, channels and alpha
// presence. Used for verification after encoding.
uint8_t* jxl_decode(const uint8_t* jxl, size_t jxl_size, uint32_t* out_width,
                    uint32_t* out_height, uint32_t* out_channels,
                    int* out_has_alpha, size_t* out_size) {
  clear_error();
  if (out_width == nullptr || out_height == nullptr ||
      out_channels == nullptr || out_has_alpha == nullptr ||
      out_size == nullptr) {
    set_error("Punteros de salida nulos.");
    return nullptr;
  }
  *out_width = 0;
  *out_height = 0;
  *out_channels = 0;
  *out_has_alpha = 0;
  *out_size = 0;
  if (jxl == nullptr || jxl_size == 0) {
    set_error("No se recibieron bytes JPEG XL.");
    return nullptr;
  }

  DecoderPtr decoder(JxlDecoderCreate(nullptr));
  if (!decoder) {
    set_error("No se pudo crear el decodificador JPEG XL.");
    return nullptr;
  }
  if (JxlDecoderSubscribeEvents(decoder.get(), JXL_DEC_BASIC_INFO |
                                                 JXL_DEC_FULL_IMAGE) !=
      JXL_DEC_SUCCESS) {
    set_error("No se pudieron suscribir los eventos del decodificador.");
    return nullptr;
  }

  JxlColorEncoding color;
  JxlColorEncodingSetToSRGB(&color, JXL_FALSE);
  JxlDecoderSetPreferredColorProfile(decoder.get(), &color);

  if (JxlDecoderSetInput(decoder.get(), jxl, jxl_size) != JXL_DEC_SUCCESS) {
    set_error("No se pudo asignar la entrada al decodificador.");
    return nullptr;
  }

  uint32_t width = 0;
  uint32_t height = 0;
  uint32_t channels = 0;
  std::vector<uint8_t> pixels;
  JxlPixelFormat format = {4, JXL_TYPE_UINT8, JXL_LITTLE_ENDIAN, 0};

  for (;;) {
    const JxlDecoderStatus status = JxlDecoderProcessInput(decoder.get());
    if (status == JXL_DEC_ERROR) {
      set_error("El decodificador JPEG XL devolvió un error.");
      return nullptr;
    }
    if (status == JXL_DEC_NEED_MORE_INPUT) {
      set_error("El archivo JPEG XL está truncado o incompleto.");
      return nullptr;
    }
    if (status == JXL_DEC_BASIC_INFO) {
      JxlBasicInfo info;
      if (JxlDecoderGetBasicInfo(decoder.get(), &info) != JXL_DEC_SUCCESS) {
        set_error("No se pudo leer la información básica del JXL.");
        return nullptr;
      }
      width = info.xsize;
      height = info.ysize;
      const bool has_alpha = info.alpha_bits != 0;
      channels = has_alpha ? 4 : 3;
      *out_has_alpha = has_alpha ? 1 : 0;
      continue;
    }
    if (status == JXL_DEC_NEED_IMAGE_OUT_BUFFER) {
      if (width == 0 || height == 0) {
        set_error("El decodificador pidió píxeles antes de la información "
                  "básica.");
        return nullptr;
      }
      format.num_channels = channels;
      size_t buffer_size = 0;
      if (JxlDecoderImageOutBufferSize(decoder.get(), &format, &buffer_size) !=
          JXL_DEC_SUCCESS) {
        set_error("No se pudo calcular el tamaño del búfer de píxeles.");
        return nullptr;
      }
      pixels.resize(buffer_size);
      if (JxlDecoderSetImageOutBuffer(decoder.get(), &format, pixels.data(),
                                      pixels.size()) != JXL_DEC_SUCCESS) {
        set_error("No se pudo asignar el búfer de píxeles.");
        return nullptr;
      }
      continue;
    }
    if (status == JXL_DEC_FULL_IMAGE) {
      break;
    }
    if (status == JXL_DEC_SUCCESS) {
      break;
    }
    if (status == JXL_DEC_COLOR_ENCODING) {
      continue;
    }
    // Ignore other informative events (frame headers, etc.).
  }

  if (pixels.empty() || width == 0 || height == 0) {
    set_error("El decodificador no produjo píxeles.");
    return nullptr;
  }
  *out_width = width;
  *out_height = height;
  *out_channels = channels;
  return copy_to_caller(pixels, out_size);
}

// Reconstructs the original JPEG bytes from a JPEG XL file that was created
// with jxl_encode_jpeg(). Returns nullptr if the file has no JPEG
// reconstruction data.
uint8_t* jxl_reconstruct_jpeg(const uint8_t* jxl, size_t jxl_size,
                              size_t* out_size) {
  clear_error();
  if (out_size == nullptr) {
    set_error("Puntero de tamaño de salida nulo.");
    return nullptr;
  }
  *out_size = 0;
  if (jxl == nullptr || jxl_size == 0) {
    set_error("No se recibieron bytes JPEG XL.");
    return nullptr;
  }

  DecoderPtr decoder(JxlDecoderCreate(nullptr));
  if (!decoder) {
    set_error("No se pudo crear el decodificador JPEG XL.");
    return nullptr;
  }
  if (JxlDecoderSubscribeEvents(decoder.get(), JXL_DEC_BASIC_INFO |
                                                 JXL_DEC_JPEG_RECONSTRUCTION |
                                                 JXL_DEC_FULL_IMAGE) !=
      JXL_DEC_SUCCESS) {
    set_error("No se pudieron suscribir los eventos de reconstrucción JPEG.");
    return nullptr;
  }
  if (JxlDecoderSetInput(decoder.get(), jxl, jxl_size) != JXL_DEC_SUCCESS) {
    set_error("No se pudo asignar la entrada al decodificador.");
    return nullptr;
  }

  constexpr size_t kChunk = 1u << 20;  // 1 MiB
  std::vector<uint8_t> output;
  size_t written = 0;
  bool reconstruction_seen = false;

  auto provide_buffer = [&]() -> bool {
    if (output.size() - written < kChunk) {
      output.resize(written + kChunk);
    }
    if (JxlDecoderSetJPEGBuffer(decoder.get(), output.data() + written,
                                output.size() - written) != JXL_DEC_SUCCESS) {
      set_error("No se pudo asignar el búfer de reconstrucción JPEG.");
      return false;
    }
    return true;
  };

  for (;;) {
    const JxlDecoderStatus status = JxlDecoderProcessInput(decoder.get());
    if (status == JXL_DEC_ERROR) {
      set_error("El decodificador JPEG XL devolvió un error.");
      return nullptr;
    }
    if (status == JXL_DEC_NEED_MORE_INPUT) {
      set_error("El archivo JPEG XL está truncado o incompleto.");
      return nullptr;
    }
    if (status == JXL_DEC_BASIC_INFO) {
      continue;
    }
    if (status == JXL_DEC_JPEG_RECONSTRUCTION) {
      reconstruction_seen = true;
      // No JPEG buffer is set yet: provide the first chunk.
      if (!provide_buffer()) {
        return nullptr;
      }
      continue;
    }
    if (status == JXL_DEC_JPEG_NEED_MORE_OUTPUT) {
      // Release the previous buffer, remember how many bytes were written,
      // then provide a larger chunk after the already-written data.
      const size_t remaining = JxlDecoderReleaseJPEGBuffer(decoder.get());
      written = output.size() - remaining;
      if (!provide_buffer()) {
        return nullptr;
      }
      continue;
    }
    if (status == JXL_DEC_FULL_IMAGE || status == JXL_DEC_SUCCESS) {
      break;
    }
    // Other events are not subscribed to.
  }

  if (!reconstruction_seen) {
    set_error("El JPEG XL no contiene datos de reconstrucción JPEG. Se "
              "codificó desde píxeles, no desde el bitstream JPEG original.");
    return nullptr;
  }

  // The last buffer may still be held by the decoder.
  const size_t remaining = JxlDecoderReleaseJPEGBuffer(decoder.get());
  written = output.size() - remaining;
  output.resize(written);
  return copy_to_caller(output, out_size);
}

}  // namespace
