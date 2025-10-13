# MiSTer Filter Preview Page

This site is hosted on GitHub Pages: [MiSTer Filter Preview Page](http://ghogan42.github.io/MiSTer-Filter-Preview-Page/)

This is the home of the MiSTer Filter Preview Page by Greg Hogan (SoltanG42). The purpose of this project is to allow users to preview the gamma, shadowmask, and scaling filters that are included in the [MiSTer FPGA](https://mister-devel.github.io/MkDocs_MiSTer/) project.

## Features

### Image Scaling with Polyphase Filters
- **Horizontal and Vertical Scaling**: Apply separate filters for horizontal and vertical scaling operations.
- **Polyphase Filter Implementation**: Uses 4-tap polyphase filters with support for multiple phase counts (4, 8, 16, 64, 256 phases)
- **Adaptive Filters**: Some filters support adaptive behavior that blends between dark and light coefficients based on pixel brightness
- **10-bit Support**: Filters can operate in 9-bit or 10-bit precision modes
- **Real-time Preview**: See filter results immediately with auto-update functionality

### Shadow Mask Effects
- **CRT Simulation**: Apply shadow mask patterns to simulate various CRT display technologies
- **Multi-resolution Support**: Masks automatically select appropriate patterns based on output resolution
- **2x Scaling Option**: Apply masks at half resolution for different visual effects

### Gamma Correction
- **Lookup Table Based**: Uses 256-entry lookup tables for gamma correction
- **Single and Three-Channel Support**: Can apply uniform gamma or separate corrections per RGB channel

### Scaling Modes
- **Full Screen**: Scale image to fill entire output resolution
- **Aspect Ratio**: Maintain original aspect ratio with letterboxing
- **vscale_mode Emulation**: Three modes (1, 2, 3) that mimic MiSTer's vertical scaling behavior with step-based scaling factors

### User Interface Features
- **Searchable Filter Libraries**: Quickly find filters, masks, and gamma tables using search functionality
- **Real-time Editing**: Modify filter coefficients and see results immediately
- **File Loading**: Load custom filter files in .txt format
- **Image Export**: Save processed images with optional information overlay

## Contributing

If you encounter problems or have suggestions for improvements, please file an issue or submit a pull request on the GitHub repository.