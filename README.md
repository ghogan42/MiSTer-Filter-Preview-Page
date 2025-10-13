# MiSTer Filter Preview Page

This site is hosted on GitHub Pages: [MiSTer Filter Preview Page](http://ghogan42.github.io/MiSTer-Filter-Preview-Page/)

This is the home of the MiSTer Filter Preview Page by Greg Hogan (SoltanG42). The purpose of this project is to allow users to preview the gamma, shadowmask, and scaling filters that are included in the [MiSTer FPGA](https://mister-devel.github.io/MkDocs_MiSTer/) project.

## Features

### Image Scaling with Polyphase Filters
- **Horizontal and Vertical Scaling**: Apply separate filters for horizontal and vertical scaling operations
- **Polyphase Filter Implementation**: Uses 4-tap polyphase filters with support for multiple phase counts (4, 8, 16, 64, 256 phases)
- **Adaptive Filters**: Some filters support adaptive behavior that blends between dark and light coefficients based on pixel brightness
- **10-bit Support**: Filters can operate in 9-bit or 10-bit precision modes
- **Real-time Preview**: See filter results immediately with auto-update functionality

### Shadow Mask Effects
- **CRT Simulation**: Apply shadow mask patterns to simulate various CRT display technologies
- **Multi-resolution Support**: Masks automatically select appropriate patterns based on output resolution
- **2x Scaling Option**: Apply masks at half resolution for different visual effects
- **Complex Pattern Support**: Supports advanced multi-chromatic patterns with brightness/darkness modulation

### Gamma Correction
- **Lookup Table Based**: Uses 256-entry lookup tables for gamma correction
- **Single and Three-Channel Support**: Can apply uniform gamma or separate corrections per RGB channel
- **Pre/Post Processing**: Gamma can be applied before or after scaling operations

### Scaling Modes
- **Full Screen**: Scale image to fill entire output resolution
- **Aspect Ratio**: Maintain original aspect ratio with letterboxing
- **vscale_mode Emulation**: Three modes (1, 2, 3) that mimic MiSTer's vertical scaling behavior with step-based scaling factors

### User Interface Features
- **Searchable Filter Libraries**: Quickly find filters, masks, and gamma tables using search functionality
- **Real-time Editing**: Modify filter coefficients and see results immediately
- **File Loading**: Load custom filter files in .txt format
- **Image Export**: Save processed images with optional information overlay
- **Responsive Preview**: Canvas preview with fit-to-width option

## Algorithms and Implementation

### Polyphase Filter Algorithm
The scaling algorithm uses a 4-tap polyphase filter implementation:

```javascript
// For each output pixel:
sourcePos = (i + 0.5) / destSize * sourceSize
phase = floor(fracPart * numPhases + numPhases / 2) % numPhases

// Apply 4-tap filter:
output = (coeffs[0] * t0 + coeffs[1] * t1 + coeffs[2] * t2 + coeffs[3] * t3) / fullBrightness
```

**Key Features:**
- **Phase Selection**: Uses fractional position to select appropriate filter phase
- **Adaptive Blending**: For adaptive filters, blends between dark and light coefficients based on center tap brightness
- **Clamping**: Ensures pixel values remain in valid 0-255 range

### Shadow Mask Algorithm
Shadow masks use a sophisticated pattern application system:

```javascript
// Each mask cell contains:
rB, gB, bB: Brightness flags (0 or 1)
rD, gD, bD: Darkness flags (inverse of brightness flags)
b0-b3, c0-c3: Brightness and contrast modulation bits

// Application formula:
add = (pixel >> 4) * b0 + (pixel >> 3) * b1 + (pixel >> 2) * b2 + (pixel >> 1) * b3
sub = pixel - ((pixel >> 4) * c0 + (pixel >> 3) * c1 + (pixel >> 2) * c2 + (pixel >> 1) * c3)
final = pixel + brightnessFlag * add - darknessFlag * sub
```

### Gamma Correction
Gamma correction uses lookup tables for efficient processing:

```javascript
// For each pixel channel:
outputRed = gammaTable.rTable[inputRed]
outputGreen = gammaTable.gTable[inputGreen]
outputBlue = gammaTable.bTable[inputBlue]
```

## File Formats

### Filter Files (.txt)
Filter files contain coefficient data with optional headers:
- **10bit**: Indicates 10-bit coefficient range (-512 to 511)
- **adaptive**: Indicates adaptive filter with dark/light coefficient pairs
- **Coefficient Lines**: Four comma-separated integers per line

### Shadow Mask Files (.txt)
Mask files use a structured format:
- **Resolution=N**: Specifies target resolution for pattern
- **v2**: Version identifier
- **Width,Height**: Pattern dimensions
- **Pattern Data**: Comma-separated 3-character codes representing mask cells

### Gamma Files (.txt)
Gamma files contain 256 entries:
- **Single Channel**: One value per line, applied to all RGB channels
- **Three Channel**: Three comma-separated values per line (R,G,B)

## Usage Instructions

1. **Load an Image**: Use the input image selector or the default sample.png will be used
2. **Select Filters**: Choose horizontal and vertical filters from dropdowns or load custom files
3. **Configure Settings**: Set output resolution, scaling mode, and aspect ratio
4. **Apply Effects**: Enable shadow masks and gamma correction as desired
5. **Preview**: View the processed image in real-time
6. **Save**: Export the final result with optional information overlay

## Technical Details

- **Pure JavaScript**: No external dependencies required
- **Canvas-based Processing**: Uses HTML5 Canvas for image manipulation
- **Modular Architecture**: Separate modules for filters, masks, and gamma processing
- **Performance Optimized**: Efficient algorithms for real-time processing

## Default Configuration

The application loads with sensible defaults:
- **Horizontal Filter**: Lanczos 3 (10-bit)
- **Vertical Filter**: Scanlines Adaptive (Dark 0.40, Bright 0.70)
- **Shadow Mask**: MG Stripe (Magenta Green)
- **Gamma**: Polynomial 2.7

## Contributing

If you encounter problems or have suggestions for improvements, please file an issue or submit a pull request on the GitHub repository.