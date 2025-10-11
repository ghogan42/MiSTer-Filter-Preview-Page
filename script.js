// MiSTer Polyphase Filter Image Scaler - JavaScript Version
// Ported from image_scaler.py with identical math

// --- Structure for pre-decoded mask data ---
class MaskCell {
    constructor() {
        this.rB = 0;
        this.gB = 0;
        this.bB = 0;
        this.rD = 0;
        this.gD = 0;
        this.bD = 0;
        this.b0 = 0;
        this.b1 = 0;
        this.b2 = 0;
        this.b3 = 0;
        this.c0 = 0;
        this.c1 = 0;
        this.c2 = 0;
        this.c3 = 0;
    }
}

// --- Parse one 3-character mask string into a MaskCell ---
function parseMask(mask) {
    const m = new MaskCell();

    // First char: 3 bits
    let value = mask.charAt(0) - '0';
    m.rB = (value >> 2) & 1;
    m.gB = (value >> 1) & 1;
    m.bB = (value >> 0) & 1;
    m.rD = m.rB ^ 1;
    m.gD = m.gB ^ 1;
    m.bD = m.bB ^ 1;

    // Second char: 4 bits
    let c = mask.charAt(1).toLowerCase();
    value = parseInt(c, 16);
    m.b0 = (value >> 0) & 1;
    m.b1 = (value >> 1) & 1;
    m.b2 = (value >> 2) & 1;
    m.b3 = (value >> 3) & 1;

    // Third char: 4 bits
    c = mask.charAt(2).toLowerCase();
    value = parseInt(c, 16);
    m.c0 = (value >> 0) & 1;
    m.c1 = (value >> 1) & 1;
    m.c2 = (value >> 2) & 1;
    m.c3 = (value >> 3) & 1;

    return m;
}

// --- Load the mask pattern from text ---
function loadMaskPattern(maskText) {
    const lines = maskText.split('\n');
    const patterns = [];
    let currentResolution = 0;
    let currentWidth = 0;
    let currentHeight = 0;
    let currentPatternRows = [];
    let inPattern = false;
    
    for (let line of lines) {
        line = line.trim();
        
        // Skip empty lines and comments
        if (line === '' || line.startsWith('#') || line.startsWith('####')) {
            continue;
        }
        
        // Check for resolution line
        if (line.startsWith('Resolution=')) {
            // If we were in a pattern, save it before starting new one
            if (inPattern) {
                if (currentWidth === 0 || currentHeight === 0) {
                    throw new Error('Mask text missing width/height definition.');
                }
                
                const pattern = new Array(currentHeight);
                for (let y = 0; y < currentHeight; y++) {
                    pattern[y] = new Array(currentWidth);
                    for (let x = 0; x < currentWidth; x++) {
                        pattern[y][x] = parseMask(currentPatternRows[y][x]);
                    }
                }
                
                patterns.push({
                    resolution: currentResolution,
                    pattern: pattern
                });
                
                // Reset for next pattern
                currentPatternRows = [];
                currentWidth = 0;
                currentHeight = 0;
                inPattern = false;
            }
            
            // Parse resolution value
            const resolutionMatch = line.match(/Resolution=(\d+)/);
            if (resolutionMatch) {
                currentResolution = parseInt(resolutionMatch[1]);
            } else {
                currentResolution = 0;
            }
            continue;
        }
        
        // Check for pattern version line (v2)
        if (line === 'v2') {
            inPattern = true;
            continue;
        }
        
        // If we're in a pattern, parse width/height and pattern rows
        if (inPattern) {
            // e.g., "2,5"
            if (line.match(/^\d+,\d+$/)) {
                const parts = line.split(',');
                currentWidth = parseInt(parts[0]);
                currentHeight = parseInt(parts[1]);
                continue;
            }
            
            // e.g., "54f,24f"
            if (line.includes(',')) {
                currentPatternRows.push(line.split(','));
            }
        }
    }
    
    // Handle the last pattern if file ends without another Resolution line
    if (inPattern && currentPatternRows.length > 0) {
        if (currentWidth === 0 || currentHeight === 0) {
            throw new Error('Mask text missing width/height definition.');
        }
        
        const pattern = new Array(currentHeight);
        for (let y = 0; y < currentHeight; y++) {
            pattern[y] = new Array(currentWidth);
            for (let x = 0; x < currentWidth; x++) {
                pattern[y][x] = parseMask(currentPatternRows[y][x]);
            }
        }
        
        patterns.push({
            resolution: currentResolution,
            pattern: pattern
        });
    }
    
    if (patterns.length === 0) {
        throw new Error('No valid patterns found in mask text.');
    }
    
    return patterns;
}

// --- Select the appropriate pattern based on output resolution ---
function selectPatternForResolution(patterns, outputHeight) {
    if (!patterns || patterns.length === 0) {
        throw new Error('No patterns available for selection');
    }
    
    // Sort patterns by resolution in descending order
    const sortedPatterns = [...patterns].sort((a, b) => b.resolution - a.resolution);
    
    // Find the first pattern where outputHeight >= pattern resolution
    for (const patternData of sortedPatterns) {
        if (outputHeight >= patternData.resolution) {
            return patternData.pattern;
        }
    }
    
    // If no pattern matches, use the pattern with the lowest resolution (should be Resolution=0)
    return sortedPatterns[sortedPatterns.length - 1].pattern;
}

// --- Apply the shadowmask pattern over an ImageData ---
function applyMaskToImage(imageData, patterns, is2x = false, outputHeight = null) {
    // If patterns is already a single pattern (backward compatibility), use it directly
    let pattern;
    if (Array.isArray(patterns) && patterns[0] && patterns[0].resolution !== undefined) {
        // It's an array of pattern objects with resolution
        pattern = selectPatternForResolution(patterns, outputHeight || imageData.height);
    } else {
        // It's a single pattern (old format)
        pattern = patterns;
    }
    const maskHeight = pattern.length;
    const maskWidth = pattern[0].length;
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            const a = data[index + 3];  // alpha channel
            let r = data[index];
            let g = data[index + 1];
            let b = data[index + 2];
            
            const pixel = [r, g, b];
            
            // Apply 2x scaling if enabled - use half the pattern size for modulo
            let maskX = x;
            let maskY = y;
            if (is2x) {
                maskX = Math.floor(x / 2);
                maskY = Math.floor(y / 2);
            }
            
            const m = pattern[maskY % maskHeight][maskX % maskWidth];
            
            // --- Compute deltas and apply ---
            const add0 = (pixel[0] >> 4) * m.b0 + (pixel[0] >> 3) * m.b1 + (pixel[0] >> 2) * m.b2 + (pixel[0] >> 1) * m.b3;
            const add1 = (pixel[1] >> 4) * m.b0 + (pixel[1] >> 3) * m.b1 + (pixel[1] >> 2) * m.b2 + (pixel[1] >> 1) * m.b3;
            const add2 = (pixel[2] >> 4) * m.b0 + (pixel[2] >> 3) * m.b1 + (pixel[2] >> 2) * m.b2 + (pixel[2] >> 1) * m.b3;
            
            const sub0 = pixel[0] - ((pixel[0] >> 4) * m.c0 + (pixel[0] >> 3) * m.c1 + (pixel[0] >> 2) * m.c2 + (pixel[0] >> 1) * m.c3);
            const sub1 = pixel[1] - ((pixel[1] >> 4) * m.c0 + (pixel[1] >> 3) * m.c1 + (pixel[1] >> 2) * m.c2 + (pixel[1] >> 1) * m.c3);
            const sub2 = pixel[2] - ((pixel[2] >> 4) * m.c0 + (pixel[2] >> 3) * m.c1 + (pixel[2] >> 2) * m.c2 + (pixel[2] >> 1) * m.c3);
            
            pixel[0] += m.rB * add0 - m.rD * sub0;
            pixel[1] += m.gB * add1 - m.gD * sub1;
            pixel[2] += m.bB * add2 - m.bD * sub2;
            
            // Clamp to [0, 255]
            r = Math.max(0, Math.min(255, pixel[0]));
            g = Math.max(0, Math.min(255, pixel[1]));
            b = Math.max(0, Math.min(255, pixel[2]));
            
            data[index] = r;
            data[index + 1] = g;
            data[index + 2] = b;
            data[index + 3] = a;
        }
    }
    
    return imageData;
}

class FilterData {
    constructor(coefficients, is10bit = false, isAdaptive = false) {
        this.coefficients = coefficients;
        this.is10bit = is10bit;
        this.isAdaptive = isAdaptive;
        this.numPhases = coefficients.length / (isAdaptive ? 2 : 1);
        this.fullBrightness = is10bit ? 256 : 128;
        
        // For adaptive filters, split into dark and light coefficients
        if (isAdaptive) {
            this.darkCoefficients = coefficients.slice(0, this.numPhases);
            this.lightCoefficients = coefficients.slice(this.numPhases);
        } else {
            this.darkCoefficients = coefficients;
            this.lightCoefficients = null;
        }
    }
}

// Embedded filters from filters.js
const embeddedFilters = window.filters || {};


// Global variables to store current state
let currentHorzFilter = null;
let currentVertFilter = null;
let currentShadowMask = null;
let currentGamma = null;
let originalImage = null;
let scaledImageData = null;
let canvasContext = null;

// Default filter configuration - change these to set default filters
const DEFAULT_HORZ_FILTER_NAME = 'Upscaling - Lanczos Bicubic etc/lanczos3_10.txt'; // Set to filter name string for default horizontal filter
const DEFAULT_VERT_FILTER_NAME = 'Scanlines - Adaptive/SLA_Dk_040_Br_070.txt'; // Set to filter name string for default vertical filter
const DEFAULT_SHADOWMASK_NAME = 'Complex (Multichromatic)/Other/Stripe/MG Stripe (Magenta Green).txt'; // Set to filter name string for default vertical filter
const DEFAULT_GAMMA_NAME = 'Poly_Gamma/Poly 2.7.txt'; // Set to gamma name string for default gamma

// Global variables for search functionality
let originalFilterNames = [];
let originalShadowMaskNames = [];
let originalGammaNames = [];
let filteredFilterNames = [];
let filteredShadowMaskNames = [];
let filteredGammaNames = [];

function clampPixelIndex(index, maxIndex) {
    return Math.max(0, Math.min(index, maxIndex));
}

function getPixelValue(imageData, x, y, channel) {
    const index = (y * imageData.width + x) * 4 + channel;
    return imageData.data[index];
}

function setPixelValue(imageData, x, y, channel, value) {
    const index = (y * imageData.width + x) * 4 + channel;
    // Clamp to 0-255 range and round to nearest integer
    imageData.data[index] = Math.max(0, Math.min(255, Math.round(value)));
}

function applyPolyphaseFilter(imageData, filterData, sourceSize, destSize, axis) {
    const sourceWidth = imageData.width;
    const sourceHeight = imageData.height;
    
    let destWidth, destHeight;
    if (axis === 0) { // Horizontal scaling
        destWidth = destSize;
        destHeight = sourceHeight;
    } else { // Vertical scaling
        destWidth = sourceWidth;
        destHeight = destSize;
    }
    
    const destImageData = new ImageData(destWidth, destHeight);
    
    for (let i = 0; i < destSize; i++) {
        // Calculate source position - exact formula from Python code
        const sourcePos = (i + 0.5) / destSize * sourceSize;
        
        // Simplified phase computation
        const fracPart = sourcePos - Math.floor(sourcePos);
        let phase = Math.floor(fracPart * filterData.numPhases + filterData.numPhases / 2);
        phase = phase % filterData.numPhases;
        
        // Get coefficients for this phase
        const darkCoeffs = filterData.darkCoefficients[phase];
        
        if (axis === 0) { // Horizontal scaling
            for (let y = 0; y < sourceHeight; y++) {
                const baseIndex = Math.floor(sourcePos - 0.5);
                const maxIndex = sourceWidth - 1;
                
                const t0 = clampPixelIndex(baseIndex - 1, maxIndex);
                const t1 = clampPixelIndex(baseIndex, maxIndex);
                const t2 = clampPixelIndex(baseIndex + 1, maxIndex);
                const t3 = clampPixelIndex(baseIndex + 2, maxIndex);
                
                for (let channel = 0; channel < 3; channel++) { // RGB channels
                    const t0Val = getPixelValue(imageData, t0, y, channel);
                    const t1Val = getPixelValue(imageData, t1, y, channel);
                    const t2Val = getPixelValue(imageData, t2, y, channel);
                    const t3Val = getPixelValue(imageData, t3, y, channel);
                    
                    if (filterData.isAdaptive && filterData.lightCoefficients) {
                        const lightCoeffs = filterData.lightCoefficients[phase];
                        
                        const darkOutput = (darkCoeffs[0] * t0Val + darkCoeffs[1] * t1Val +
                                          darkCoeffs[2] * t2Val + darkCoeffs[3] * t3Val) / filterData.fullBrightness;
                        
                        const lightOutput = (lightCoeffs[0] * t0Val + lightCoeffs[1] * t1Val +
                                           lightCoeffs[2] * t2Val + lightCoeffs[3] * t3Val) / filterData.fullBrightness;
                        
                        // Interpolate based on center tap brightness (t1)
                        let t1Normalized = t1Val / 255.0;
                        t1Normalized = Math.max(0.0, Math.min(1.0, t1Normalized));
                        
                        // Blend: higher brightness uses more light filter
                        const output = t1Normalized * lightOutput + (1.0 - t1Normalized) * darkOutput;
                        
                        setPixelValue(destImageData, i, y, channel, output);
                    } else {
                        // Single filter (non-adaptive)
                        const output = (darkCoeffs[0] * t0Val + darkCoeffs[1] * t1Val +
                                       darkCoeffs[2] * t2Val + darkCoeffs[3] * t3Val) / filterData.fullBrightness;
                        setPixelValue(destImageData, i, y, channel, output);
                    }
                }
                // Alpha channel
                setPixelValue(destImageData, i, y, 3, 255);
            }
        } else { // Vertical scaling
            for (let x = 0; x < sourceWidth; x++) {
                const baseIndex = Math.floor(sourcePos - 0.5);
                const maxIndex = sourceHeight - 1;
                
                const t0 = clampPixelIndex(baseIndex - 1, maxIndex);
                const t1 = clampPixelIndex(baseIndex, maxIndex);
                const t2 = clampPixelIndex(baseIndex + 1, maxIndex);
                const t3 = clampPixelIndex(baseIndex + 2, maxIndex);
                
                for (let channel = 0; channel < 3; channel++) { // RGB channels
                    const t0Val = getPixelValue(imageData, x, t0, channel);
                    const t1Val = getPixelValue(imageData, x, t1, channel);
                    const t2Val = getPixelValue(imageData, x, t2, channel);
                    const t3Val = getPixelValue(imageData, x, t3, channel);
                    
                    if (filterData.isAdaptive && filterData.lightCoefficients) {
                        const lightCoeffs = filterData.lightCoefficients[phase];
                        
                        const darkOutput = (darkCoeffs[0] * t0Val + darkCoeffs[1] * t1Val +
                                          darkCoeffs[2] * t2Val + darkCoeffs[3] * t3Val) / filterData.fullBrightness;
                        
                        const lightOutput = (lightCoeffs[0] * t0Val + lightCoeffs[1] * t1Val +
                                           lightCoeffs[2] * t2Val + lightCoeffs[3] * t3Val) / filterData.fullBrightness;
                        
                        // Interpolate based on center tap brightness (t1)
                        let t1Normalized = t1Val / 255.0;
                        t1Normalized = Math.max(0.0, Math.min(1.0, t1Normalized));
                        
                        // Blend: higher brightness uses more light filter
                        const output = t1Normalized * lightOutput + (1.0 - t1Normalized) * darkOutput;
                        
                        setPixelValue(destImageData, x, i, channel, output);
                    } else {
                        // Single filter (non-adaptive)
                        const output = (darkCoeffs[0] * t0Val + darkCoeffs[1] * t1Val +
                                       darkCoeffs[2] * t2Val + darkCoeffs[3] * t3Val) / filterData.fullBrightness;
                        setPixelValue(destImageData, x, i, channel, output);
                    }
                }
                // Alpha channel
                setPixelValue(destImageData, x, i, 3, 255);
            }
        }
    }
    
    return destImageData;
}

function scaleImage(imageData, horzFilter, vertFilter, targetWidth, targetHeight) {
    const originalWidth = imageData.width;
    const originalHeight = imageData.height;
    let currentImageData = imageData;
    
    // Apply horizontal scaling first
    if (originalWidth !== targetWidth) {
        console.log(`Applying horizontal filter: ${originalWidth} -> ${targetWidth}`);
        currentImageData = applyPolyphaseFilter(currentImageData, horzFilter, originalWidth, targetWidth, 0);
        
        // Ensure pixel values are properly clamped after horizontal pass
        clampImageData(currentImageData);
    }
    
    // Apply vertical scaling
    if (originalHeight !== targetHeight) {
        console.log(`Applying vertical filter: ${originalHeight} -> ${targetHeight}`);
        currentImageData = applyPolyphaseFilter(currentImageData, vertFilter, originalHeight, targetHeight, 1);
        
        // Ensure pixel values are properly clamped after vertical pass
        clampImageData(currentImageData);
    }
    
    return currentImageData;
}

function clampImageData(imageData) {
    // Explicitly clamp all pixel values to 0-255 range
    for (let i = 0; i < imageData.data.length; i++) {
        imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i]));
    }
}

function parseFilterText(filterText) {
    let is10bit = false;
    let isAdaptive = false;
    const coefficients = [];
    
    const lines = filterText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines
        if (!line) continue;
            
        // Check for keywords at the beginning of file
        if (i < 5) { // Only check first few lines for keywords
            if (line === "10bit") {
                is10bit = true;
                console.log("10 Bit = True");
                continue;
            } else if (line === "adaptive") {
                isAdaptive = true;
                console.log("Adaptive = True");
                continue;
            }
        }
        
        // Skip comments
        if (line.startsWith('#')) continue;
            
        // Parse coefficient line
        const parts = line.split(',').map(part => part.trim());
        if (parts.length !== 4) {
            throw new Error(`Expected 4 coefficients, got ${parts.length} on line ${i + 1}`);
        }
        
        const coeffs = parts.map(part => parseInt(part, 10));
        
        // Validate coefficient ranges
        const minVal = is10bit ? -512 : -256;
        const maxVal = is10bit ? 511 : 255;
        
        for (const coeff of coeffs) {
            if (coeff < minVal || coeff > maxVal) {
                console.warn(`Warning: Coefficient ${coeff} out of range [${minVal}, ${maxVal}] on line ${i + 1}`);
            }
        }
        
        coefficients.push(coeffs);
    }
    
    if (coefficients.length === 0) {
        throw new Error("No valid coefficients found in filter file");
    }
    
    // Validate adaptive filter structure
    if (isAdaptive && coefficients.length % 2 !== 0) {
        throw new Error("Adaptive filter must have even number of coefficient lines");
    }
    
    const numPhases = coefficients.length / (isAdaptive ? 2 : 1);
    const validPhases = [4, 8, 16, 64, 256];
    
    if (!validPhases.includes(numPhases)) {
        throw new Error(`Invalid phase count: ${numPhases}. Must be one of ${validPhases}`);
    }
    
    console.log(`Filter parsed: ${numPhases} phases, ${is10bit ? '10-bit' : '9-bit'}, ${isAdaptive ? 'adaptive' : 'single'}`);
    
    return new FilterData(coefficients, is10bit, isAdaptive);
}

async function loadFilterFromFile(axis) {
    const fileInput = document.getElementById(`${axis}FilterFile`);
    const textarea = document.getElementById(`${axis}Coeffs`);
    const filterNameSpan = document.getElementById(`${axis}FilterName`);
    const dropdown = document.getElementById(`${axis}FilterDropdown`);
    
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please select a filter file');
        return;
    }
    
    const file = fileInput.files[0];
    
    try {
        const filterText = await readFileAsText(file);
        const filterData = parseFilterText(filterText);
        
        if (axis === 'horz') {
            currentHorzFilter = filterData;
        } else {
            currentVertFilter = filterData;
        }
        
        // Display coefficients in textarea
        let coeffText = '';
        if (filterData.isAdaptive) {
            coeffText += '# Dark coefficients (low brightness)\n';
            filterData.darkCoefficients.forEach(coeffs => {
                coeffText += coeffs.join(', ') + '\n';
            });
            coeffText += '\n# Light coefficients (high brightness)\n';
            filterData.lightCoefficients.forEach(coeffs => {
                coeffText += coeffs.join(', ') + '\n';
            });
        } else {
            filterData.coefficients.forEach(coeffs => {
                coeffText += coeffs.join(', ') + '\n';
            });
        }
        
        textarea.value = coeffText;
        textarea.readOnly = false;
        filterNameSpan.textContent = file.name.replace('.txt', '');
        
        // Reset dropdown to "Custom" option
        dropdown.value = 'custom';
        
        // Enable process button if both filters are loaded
        updateProcessButton();
        
    } catch (error) {
        alert(`Error loading ${axis} filter: ${error.message}`);
    }
}

function loadEmbeddedFilter(axis, filterName) {
    const textarea = document.getElementById(`${axis}Coeffs`);
    const filterNameSpan = document.getElementById(`${axis}FilterName`);
    const fileInput = document.getElementById(`${axis}FilterFile`);
    
    if (filterName === 'custom') {
        // Clear the filter if custom is selected
        if (axis === 'horz') {
            currentHorzFilter = null;
        } else {
            currentVertFilter = null;
        }
        textarea.value = '';
        filterNameSpan.textContent = 'None';
        fileInput.value = '';
        updateProcessButton();
        return;
    }
    
    const filterData = embeddedFilters[filterName];
    if (!filterData) {
        alert(`Embedded filter "${filterName}" not found`);
        return;
    }
    
    try {
        const filterObj = parseFilterText(filterData);
        
        if (axis === 'horz') {
            currentHorzFilter = filterObj;
        } else {
            currentVertFilter = filterObj;
        }
        
        // Display coefficients in textarea
        let coeffText = '';
        if (filterObj.isAdaptive) {
            coeffText += '# Dark coefficients (low brightness)\n';
            filterObj.darkCoefficients.forEach(coeffs => {
                coeffText += coeffs.join(', ') + '\n';
            });
            coeffText += '\n# Light coefficients (high brightness)\n';
            filterObj.lightCoefficients.forEach(coeffs => {
                coeffText += coeffs.join(', ') + '\n';
            });
        } else {
            filterObj.coefficients.forEach(coeffs => {
                coeffText += coeffs.join(', ') + '\n';
            });
        }
        
        textarea.value = coeffText;
        textarea.readOnly = false;
        filterNameSpan.textContent = filterName;
        
        // Clear file input
        fileInput.value = '';
        
        // Enable process button if both filters are loaded
        updateProcessButton();
        
    } catch (error) {
        alert(`Error loading embedded ${axis} filter: ${error.message}`);
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            resolve(e.target.result);
        };
        reader.onerror = function(e) {
            reject(new Error('Failed to read file'));
        };
        reader.readAsText(file);
    });
}

function updateProcessButton() {
    const processButton = document.querySelector('button[onclick="processImage()"]');
    if (currentHorzFilter && currentVertFilter) {
        processButton.disabled = false;
        // Auto-update if enabled
        if (document.getElementById('autoUpdate').checked) {
            processImage();
        }
    } else {
        processButton.disabled = true;
    }
}

function updateCoefficientsFromTextarea(axis) {
    const textarea = document.getElementById(`${axis}Coeffs`);
    const filterNameSpan = document.getElementById(`${axis}FilterName`);
    
    try {
        const filterData = parseFilterText(textarea.value);
        
        if (axis === 'horz') {
            currentHorzFilter = filterData;
        } else {
            currentVertFilter = filterData;
        }
        
        filterNameSpan.textContent = 'Custom';
        updateProcessButton();
        
    } catch (error) {
        alert(`Error parsing ${axis} coefficients: ${error.message}`);
    }
}

function loadEmbeddedShadowMask(maskName) {
    const textarea = document.getElementById('shadowMaskCoeffs');
    const maskNameSpan = document.getElementById('shadowMaskName');
    const fileInput = document.getElementById('shadowMaskFile');
    
    if (maskName === 'custom') {
        // Clear the mask if custom is selected
        currentShadowMask = null;
        textarea.value = '';
        maskNameSpan.textContent = 'None';
        fileInput.value = '';
        return;
    }
    
    const maskData = window.shadowmasks[maskName];
    if (!maskData) {
        alert(`Embedded shadow mask "${maskName}" not found`);
        return;
    }
    
    try {
        // Parse and store the mask pattern
        currentShadowMask = loadMaskPattern(maskData);
        
        // Display mask data in textarea
        textarea.value = maskData;
        textarea.readOnly = false;
        maskNameSpan.textContent = maskName;
        
        // Clear file input
        fileInput.value = '';
        
        // Trigger auto-update if enabled
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
        
    } catch (error) {
        alert(`Error loading embedded shadow mask: ${error.message}`);
    }
}

async function loadShadowMaskFromFile() {
    const fileInput = document.getElementById('shadowMaskFile');
    const textarea = document.getElementById('shadowMaskCoeffs');
    const maskNameSpan = document.getElementById('shadowMaskName');
    const dropdown = document.getElementById('shadowMaskDropdown');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please select a shadow mask file');
        return;
    }
    
    const file = fileInput.files[0];
    
    try {
        const maskText = await readFileAsText(file);
        // Parse and store the mask pattern
        currentShadowMask = loadMaskPattern(maskText);
        
        // Display mask data in textarea
        textarea.value = maskText;
        textarea.readOnly = false;
        maskNameSpan.textContent = file.name.replace('.txt', '');
        
        // Reset dropdown to "Custom" option
        dropdown.value = 'custom';
        
        // Trigger auto-update if enabled
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
        
    } catch (error) {
        alert(`Error loading shadow mask: ${error.message}`);
    }
}

function updateShadowMaskFromTextarea() {
    const textarea = document.getElementById('shadowMaskCoeffs');
    const maskNameSpan = document.getElementById('shadowMaskName');
    
    try {
        // Parse and store the mask pattern
        currentShadowMask = loadMaskPattern(textarea.value);
        maskNameSpan.textContent = 'Custom';
        
        // Trigger auto-update if enabled
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
        
    } catch (error) {
        alert(`Error parsing shadow mask: ${error.message}`);
    }
}

function parseGammaText(gammaText) {
    const lines = gammaText.split('\n');
    const gammaTable = {
        rTable: new Array(256),
        gTable: new Array(256),
        bTable: new Array(256)
    };
    
    let lineCount = 0;
    let isThreeChannelFormat = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines and comments
        if (line === '' || line.startsWith('#')) {
            continue;
        }
        
        // Check if line contains commas (three-channel format)
        if (line.includes(',')) {
            isThreeChannelFormat = true;
            const parts = line.split(',').map(part => parseInt(part.trim(), 10));
            
            if (parts.length === 3) {
                if (lineCount >= 256) {
                    throw new Error('Gamma table has more than 256 entries');
                }
                
                gammaTable.rTable[lineCount] = Math.max(0, Math.min(255, parts[0]));
                gammaTable.gTable[lineCount] = Math.max(0, Math.min(255, parts[1]));
                gammaTable.bTable[lineCount] = Math.max(0, Math.min(255, parts[2]));
                lineCount++;
            } else {
                throw new Error(`Expected 3 values per line for three-channel gamma format, got ${parts.length}`);
            }
        } else {
            // Single channel format
            const value = parseInt(line, 10);
            if (!isNaN(value)) {
                if (lineCount >= 256) {
                    throw new Error('Gamma table has more than 256 entries');
                }
                
                const clampedValue = Math.max(0, Math.min(255, value));
                gammaTable.rTable[lineCount] = clampedValue;
                gammaTable.gTable[lineCount] = clampedValue;
                gammaTable.bTable[lineCount] = clampedValue;
                lineCount++;
            }
        }
    }
    
    // Check if we have exactly 256 entries
    if (lineCount !== 256) {
        throw new Error(`Gamma table must have exactly 256 entries, got ${lineCount}`);
    }
    
    console.log(`Gamma table parsed: ${isThreeChannelFormat ? 'three-channel' : 'single-channel'} format`);
    return gammaTable;
}

function applyGammaToImage(imageData, gammaTable) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            
            // Get original RGB values
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            
            // Apply gamma correction using lookup tables
            data[index] = gammaTable.rTable[r];
            data[index + 1] = gammaTable.gTable[g];
            data[index + 2] = gammaTable.bTable[b];
            // Alpha channel remains unchanged
        }
    }
    
    return imageData;
}

function loadEmbeddedGamma(gammaName) {
    const textarea = document.getElementById('gammaCoeffs');
    const gammaNameSpan = document.getElementById('gammaName');
    const fileInput = document.getElementById('gammaFile');
    
    if (gammaName === 'custom') {
        // Clear the gamma if custom is selected
        currentGamma = null;
        textarea.value = '';
        gammaNameSpan.textContent = 'None';
        fileInput.value = '';
        return;
    }
    
    const gammaData = window.gammas[gammaName];
    if (!gammaData) {
        alert(`Embedded gamma "${gammaName}" not found`);
        return;
    }
    
    try {
        // Parse and store the gamma tables
        currentGamma = parseGammaText(gammaData);
        
        // Display gamma data in textarea
        textarea.value = gammaData;
        textarea.readOnly = false;
        gammaNameSpan.textContent = gammaName;
        
        // Clear file input
        fileInput.value = '';
        
        // Trigger auto-update if enabled
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
        
    } catch (error) {
        alert(`Error loading embedded gamma: ${error.message}`);
    }
}

async function loadGammaFromFile() {
    const fileInput = document.getElementById('gammaFile');
    const textarea = document.getElementById('gammaCoeffs');
    const gammaNameSpan = document.getElementById('gammaName');
    const dropdown = document.getElementById('gammaDropdown');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please select a gamma file');
        return;
    }
    
    const file = fileInput.files[0];
    
    try {
        const gammaText = await readFileAsText(file);
        // Parse and store the gamma tables
        currentGamma = parseGammaText(gammaText);
        
        // Display gamma data in textarea
        textarea.value = gammaText;
        textarea.readOnly = false;
        gammaNameSpan.textContent = file.name.replace('.txt', '');
        
        // Reset dropdown to "Custom" option
        dropdown.value = 'custom';
        
        // Trigger auto-update if enabled
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
        
    } catch (error) {
        alert(`Error loading gamma: ${error.message}`);
    }
}

function updateGammaFromTextarea() {
    const textarea = document.getElementById('gammaCoeffs');
    const gammaNameSpan = document.getElementById('gammaName');
    
    try {
        // Parse and store the gamma tables
        currentGamma = parseGammaText(textarea.value);
        gammaNameSpan.textContent = 'Custom';
        
        // Trigger auto-update if enabled
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
        
    } catch (error) {
        alert(`Error parsing gamma: ${error.message}`);
    }
}

// --- Compute scaled size according to MiSTer vscale modes ---
function computeScaledSize(inputWidth, inputHeight, outputWidth, outputHeight, aspectRatio, vscaleMode) {
    // Determine step size
    let step;
    if (vscaleMode === 1) {
        step = 1.0;
    } else if (vscaleMode === 2) {
        step = 0.5;
    } else if (vscaleMode === 3) {
        step = 0.25;
    } else {
        throw new Error("vscaleMode must be 1, 2, or 3");
    }

    // Find vertical scaling
    let maxFactor = outputHeight / inputHeight;
    let scaleFactor = Math.floor(maxFactor / step) * step; // round down to nearest valid step

    while (scaleFactor > 0) {
        let scaledHeight = inputHeight * scaleFactor;
        let scaledWidth = Math.floor(scaledHeight * aspectRatio);

        // Check if width fits
        if (scaledWidth <= outputWidth) {
            break;
        }
        scaleFactor -= step; // reduce scaling and try again
    }

    // Compute offsets
    let top = Math.floor((outputHeight - (inputHeight * scaleFactor)) / 2);
    let left = Math.floor((outputWidth - (inputHeight * scaleFactor * aspectRatio)) / 2);

    return {
        scaleFactor: scaleFactor,
        scaledWidth: Math.floor(inputHeight * scaleFactor * aspectRatio),
        scaledHeight: Math.floor(inputHeight * scaleFactor),
        left: left,
        top: top
    };
}

async function processImage() {
    const inputFile = document.getElementById('inputImage').files[0];
    const outputWidth = parseInt(document.getElementById('outputWidth').value);
    const outputHeight = parseInt(document.getElementById('outputHeight').value);
    const scalingMode = document.getElementById('scalingMode').value;
    const aspectRatio = parseFloat(document.getElementById('aspectRatio').value) || 1.3333;
    const canvas = document.getElementById('previewCanvas');
    const saveButton = document.getElementById('saveButton');
    const applyShadowMask = document.getElementById('applyShadowMask').checked;
    const shadowMask2x = document.getElementById('shadowMask2x').checked;
    
    // Try to load default image if no file selected
    let imageFile = inputFile;
    if (!imageFile) {
        // Try to load sample.png from the same directory
        try {
            const response = await fetch('sample.png');
            if (response.ok) {
                const blob = await response.blob();
                imageFile = new File([blob], 'sample.png', { type: 'image/png' });
            }
        } catch (error) {
            console.log('Default image sample.png not found');
        }
    }
    
    if (!imageFile) {
        return;
    }
    
    if (!currentHorzFilter || !currentVertFilter) {
        alert('Please load both horizontal and vertical filters');
        return;
    }
    
    if (isNaN(outputWidth) || isNaN(outputHeight) || outputWidth <= 0 || outputHeight <= 0) {
        alert('Please enter valid output dimensions');
        return;
    }
    
    try {
        // Load and process image
        const image = await loadImage(imageFile);
        originalImage = image;
        
        const imageData = getImageData(image);
        let targetWidth = outputWidth;
        let targetHeight = outputHeight;
        let scalingInfo = null;
        
        // Apply gamma correction as the first step (before scaling) if enabled and loaded
        const applyGamma = document.getElementById('applyGamma').checked;
        if (applyGamma && currentGamma) {
            console.log('Applying gamma correction');
            applyGammaToImage(imageData, currentGamma);
        }
        
        // Determine scaling parameters based on mode
        switch (scalingMode) {
            case 'fullscreen':
                // Use full output dimensions (current behavior)
                targetWidth = outputWidth;
                targetHeight = outputHeight;
                break;
                
            case 'aspect':
                // Scale to fit while maintaining aspect ratio
                const aspectScaleX = outputWidth / image.width;
                const aspectScaleY = outputHeight / image.height;
                const aspectScale = Math.min(aspectScaleX, aspectScaleY);
                targetWidth = Math.floor(image.width * aspectScale);
                targetHeight = Math.floor(image.height * aspectScale);
                scalingInfo = {
                    scaledWidth: targetWidth,
                    scaledHeight: targetHeight,
                    left: Math.floor((outputWidth - targetWidth) / 2),
                    top: Math.floor((outputHeight - targetHeight) / 2)
                };
                break;
                
            case 'vscale1':
            case 'vscale2':
            case 'vscale3':
                const vscaleMode = parseInt(scalingMode.replace('vscale', ''));
                scalingInfo = computeScaledSize(image.width, image.height, outputWidth, outputHeight, aspectRatio, vscaleMode);
                targetWidth = scalingInfo.scaledWidth;
                targetHeight = scalingInfo.scaledHeight;
                break;
                
            default:
                throw new Error(`Unknown scaling mode: ${scalingMode}`);
        }
        
        // Scale the image to the target dimensions
        scaledImageData = scaleImage(imageData, currentHorzFilter, currentVertFilter, targetWidth, targetHeight);
        
        // Apply shadow mask if enabled and loaded
        if (applyShadowMask && currentShadowMask) {
            console.log('Applying shadow mask' + (shadowMask2x ? ' (2x)' : ''));
            scaledImageData = applyMaskToImage(scaledImageData, currentShadowMask, shadowMask2x, outputHeight);
        }
        
        // Store scaling info for display
        scaledImageData.scalingInfo = scalingInfo;
        scaledImageData.outputWidth = outputWidth;
        scaledImageData.outputHeight = outputHeight;
        
        // Display scaled image
        displayImage(scaledImageData);
        
        // Enable save button
        saveButton.disabled = false;
        
    } catch (error) {
        alert(`Error processing image: ${error.message}`);
    }
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        
        reader.onload = function(e) {
            img.onload = function() {
                resolve(img);
            };
            img.onerror = function() {
                reject(new Error('Failed to load image'));
            };
            img.src = e.target.result;
        };
        
        reader.onerror = function() {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsDataURL(file);
    });
}

function getImageData(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, image.width, image.height);
}

function displayImage(imageData) {
    const canvas = document.getElementById('previewCanvas');
    const ctx = canvas.getContext('2d');
    canvasContext = ctx;
    
    // Use output dimensions if scaling info is present, otherwise use image dimensions
    const outputWidth = imageData.outputWidth || imageData.width;
    const outputHeight = imageData.outputHeight || imageData.height;
    const scalingInfo = imageData.scalingInfo;
    
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    
    // Clear canvas with black background
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, outputWidth, outputHeight);
    
    if (scalingInfo) {
        // Draw scaled image centered with black borders
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);
        
        ctx.drawImage(
            tempCanvas,
            scalingInfo.left,
            scalingInfo.top,
            scalingInfo.scaledWidth,
            scalingInfo.scaledHeight
        );
    } else {
        // Full screen mode - draw image at full size
        ctx.putImageData(imageData, 0, 0);
    }
    
    // Add overlay text if enabled
    const showInfo = document.getElementById('showInfo').checked;
    if (showInfo) {
        addInfoOverlay(ctx, outputWidth, outputHeight);
    }
}

function addInfoOverlay(ctx, width, height) {
    ctx.fillStyle = 'yellow';
    ctx.font = 'bold 16px Arial';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    const horzFilterName = document.getElementById('horzFilterName').textContent;
    const vertFilterName = document.getElementById('vertFilterName').textContent;
    const shadowMaskName = document.getElementById('shadowMaskName').textContent;
    const outputWidth = document.getElementById('outputWidth').value;
    const outputHeight = document.getElementById('outputHeight').value;
    const scalingMode = document.getElementById('scalingMode').value;
    const aspectRatio = document.getElementById('aspectRatio').value;
    const applyShadowMask = document.getElementById('applyShadowMask').checked;
    const shadowMask2x = document.getElementById('shadowMask2x').checked;
    
    const infoText = [
        `Horizontal Filter: ${horzFilterName}`,
        `Vertical Filter: ${vertFilterName}`,
        `Shadow Mask: ${shadowMaskName}${applyShadowMask ? (shadowMask2x ? ' (2x)' : '') : ' (Off)'}`,
        `Output Resolution: ${outputWidth}x${outputHeight}`,
        `Scaling Mode: ${scalingMode}`,
        `Aspect Ratio: ${aspectRatio}`
    ];
    
    infoText.forEach((text, index) => {
        ctx.fillText(text, 10, 10 + index * 20);
    });
}

// Show/hide aspect ratio input based on scaling mode
function updateAspectRatioVisibility() {
    const scalingMode = document.getElementById('scalingMode').value;
    const aspectRatioContainer = document.getElementById('aspectRatioContainer');
    
    if (scalingMode === 'aspect' || scalingMode.startsWith('vscale')) {
        aspectRatioContainer.style.display = 'block';
    } else {
        aspectRatioContainer.style.display = 'none';
    }
}

function saveImage() {
    if (!scaledImageData) {
        alert('No image to save. Please process an image first.');
        return;
    }
    
    const outputWidth = scaledImageData.outputWidth || scaledImageData.width;
    const outputHeight = scaledImageData.outputHeight || scaledImageData.height;
    const scalingInfo = scaledImageData.scalingInfo;
    
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas with black background
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, outputWidth, outputHeight);
    
    if (scalingInfo) {
        // Draw scaled image centered with black borders
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = scaledImageData.width;
        tempCanvas.height = scaledImageData.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(scaledImageData, 0, 0);
        
        ctx.drawImage(
            tempCanvas,
            scalingInfo.left,
            scalingInfo.top,
            scalingInfo.scaledWidth,
            scalingInfo.scaledHeight
        );
    } else {
        // Full screen mode - draw image at full size
        ctx.putImageData(scaledImageData, 0, 0);
    }
    
    // Add overlay text if enabled
    const showInfo = document.getElementById('showInfo').checked;
    if (showInfo) {
        addInfoOverlay(ctx, outputWidth, outputHeight);
    }
    
    const link = document.createElement('a');
    link.download = 'scaled_image.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function populateFilterDropdowns() {
    const horzDropdown = document.getElementById('horzFilterDropdown');
    const vertDropdown = document.getElementById('vertFilterDropdown');
    const shadowMaskDropdown = document.getElementById('shadowMaskDropdown');
    const gammaDropdown = document.getElementById('gammaDropdown');
    
    // Store original lists
    originalFilterNames = Object.keys(embeddedFilters).sort();
    originalShadowMaskNames = Object.keys(window.shadowmasks || {}).sort();
    originalGammaNames = Object.keys(window.gammas || {}).sort();
    
    // Initialize filtered lists with original values
    filteredFilterNames = [...originalFilterNames];
    filteredShadowMaskNames = [...originalShadowMaskNames];
    filteredGammaNames = [...originalGammaNames];
    
    // Populate dropdowns with filtered lists
    updateFilterDropdown('horz');
    updateFilterDropdown('vert');
    updateShadowMaskDropdown();
    updateGammaDropdown();
    
    // Select and load default filters
    if (originalFilterNames.length > 0) {
        let horzFilterToLoad = originalFilterNames[0];
        let vertFilterToLoad = originalFilterNames[0];

        // Check if default horizontal filter name exists
        if (DEFAULT_HORZ_FILTER_NAME && originalFilterNames.includes(DEFAULT_HORZ_FILTER_NAME)) {
            horzFilterToLoad = DEFAULT_HORZ_FILTER_NAME;
        }
        
        // Check if default vertical filter name exists
        if (DEFAULT_VERT_FILTER_NAME && originalFilterNames.includes(DEFAULT_VERT_FILTER_NAME)) {
            vertFilterToLoad = DEFAULT_VERT_FILTER_NAME;
        }
        
        horzDropdown.value = horzFilterToLoad;
        vertDropdown.value = vertFilterToLoad;
        loadEmbeddedFilter('horz', horzFilterToLoad);
        loadEmbeddedFilter('vert', vertFilterToLoad);
    }
    
    // Load default shadow mask if available
    if (originalShadowMaskNames.length > 0) {
        
        let shadowmaskToLoad = originalShadowMaskNames[0];
        
        // Check if default shadowmask name exists
        if (DEFAULT_SHADOWMASK_NAME && originalShadowMaskNames.includes(DEFAULT_SHADOWMASK_NAME)) {
            shadowmaskToLoad = DEFAULT_SHADOWMASK_NAME;
        }

        shadowMaskDropdown.value = shadowmaskToLoad;
        loadEmbeddedShadowMask(shadowmaskToLoad);
    }
    
    // Load default gamma if available
    if (originalGammaNames.length > 0) {
        
        let gammaToLoad = originalGammaNames[0];
        
        // Check if default gamma name exists
        if (DEFAULT_GAMMA_NAME && originalGammaNames.includes(DEFAULT_GAMMA_NAME)) {
            gammaToLoad = DEFAULT_GAMMA_NAME;
        }

        gammaDropdown.value = gammaToLoad;
        loadEmbeddedGamma(gammaToLoad);
    }
}

// Update filter dropdown based on current filtered list
function updateFilterDropdown(axis) {
    const dropdown = document.getElementById(`${axis}FilterDropdown`);
    
    // Clear existing options except the first one
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }
    
    // Add filtered options
    filteredFilterNames.forEach(filterName => {
        const option = document.createElement('option');
        option.value = filterName;
        option.textContent = filterName;
        dropdown.appendChild(option);
    });
}

// Update shadow mask dropdown based on current filtered list
function updateShadowMaskDropdown() {
    const dropdown = document.getElementById('shadowMaskDropdown');
    
    // Clear existing options except the first one
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }
    
    // Add filtered options
    filteredShadowMaskNames.forEach(maskName => {
        const option = document.createElement('option');
        option.value = maskName;
        option.textContent = maskName;
        dropdown.appendChild(option);
    });
}

// Update gamma dropdown based on current filtered list
function updateGammaDropdown() {
    const dropdown = document.getElementById('gammaDropdown');
    
    // Clear existing options except the first one
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }
    
    // Add filtered options
    filteredGammaNames.forEach(gammaName => {
        const option = document.createElement('option');
        option.value = gammaName;
        option.textContent = gammaName;
        dropdown.appendChild(option);
    });
}

// Filter function for filters
function filterFilters(searchText) {
    if (!searchText) {
        return [...originalFilterNames];
    }
    
    const lowerSearch = searchText.toLowerCase();
    return originalFilterNames.filter(name =>
        name.toLowerCase().includes(lowerSearch)
    );
}

// Filter function for shadow masks
function filterShadowMasks(searchText) {
    if (!searchText) {
        return [...originalShadowMaskNames];
    }
    
    const lowerSearch = searchText.toLowerCase();
    return originalShadowMaskNames.filter(name =>
        name.toLowerCase().includes(lowerSearch)
    );
}

// Filter function for gamma files
function filterGammas(searchText) {
    if (!searchText) {
        return [...originalGammaNames];
    }
    
    const lowerSearch = searchText.toLowerCase();
    return originalGammaNames.filter(name =>
        name.toLowerCase().includes(lowerSearch)
    );
}

// Handle filter search input
function handleFilterSearch(axis, searchText) {
    filteredFilterNames = filterFilters(searchText);
    updateFilterDropdown(axis);
}

// Handle shadow mask search input
function handleShadowMaskSearch(searchText) {
    filteredShadowMaskNames = filterShadowMasks(searchText);
    updateShadowMaskDropdown();
}

// Handle gamma search input
function handleGammaSearch(searchText) {
    filteredGammaNames = filterGammas(searchText);
    updateGammaDropdown();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    canvasContext = document.getElementById('previewCanvas').getContext('2d');
    populateFilterDropdowns();
    updateAspectRatioVisibility();
    
    // Add event listener for auto-update checkbox
    document.getElementById('autoUpdate').addEventListener('change', function() {
        if (this.checked && currentHorzFilter && currentVertFilter) {
            processImage();
        }
    });
    
    // Add event listener for shadowmask checkbox to trigger auto-update
    document.getElementById('applyShadowMask').addEventListener('change', function() {
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
    });
    
    // Add event listener for shadowmask 2x checkbox to trigger auto-update
    document.getElementById('shadowMask2x').addEventListener('change', function() {
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
    });
    
    // Add event listener for shadow mask dropdown to trigger auto-update
    document.getElementById('shadowMaskDropdown').addEventListener('change', function() {
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
    });
    
    // Add event listener for shadow mask textarea changes to trigger auto-update
    document.getElementById('shadowMaskCoeffs').addEventListener('input', function() {
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            // Use a small delay to avoid processing on every keystroke
            clearTimeout(window.shadowMaskUpdateTimeout);
            window.shadowMaskUpdateTimeout = setTimeout(function() {
                updateShadowMaskFromTextarea();
                processImage();
            }, 500);
        }
    });
    
    // Add event listener for image input to trigger auto-update
    document.getElementById('inputImage').addEventListener('change', function() {
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter) {
            processImage();
        }
    });
    
    // Add event listeners for resolution changes to trigger auto-update
    document.getElementById('outputWidth').addEventListener('change', function() {
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
    });
    
    document.getElementById('outputHeight').addEventListener('change', function() {
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
    });
    
    // Add event listeners for scaling mode changes
    document.getElementById('scalingMode').addEventListener('change', function() {
        updateAspectRatioVisibility();
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
    });
    
    // Add event listener for aspect ratio changes
    document.getElementById('aspectRatio').addEventListener('change', function() {
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
    });
    
    // Add event listeners for search boxes
    document.getElementById('horzFilterSearch').addEventListener('input', function() {
        handleFilterSearch('horz', this.value);
    });
    
    document.getElementById('vertFilterSearch').addEventListener('input', function() {
        handleFilterSearch('vert', this.value);
    });
    
    document.getElementById('shadowMaskSearch').addEventListener('input', function() {
        handleShadowMaskSearch(this.value);
    });
    
    // Add event listener for gamma dropdown to trigger auto-update
    document.getElementById('gammaDropdown').addEventListener('change', function() {
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
    });
    
    // Add event listener for gamma checkbox to trigger auto-update
    document.getElementById('applyGamma').addEventListener('change', function() {
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            processImage();
        }
    });
    
    // Add event listener for gamma textarea changes to trigger auto-update
    document.getElementById('gammaCoeffs').addEventListener('input', function() {
        if (document.getElementById('autoUpdate').checked && currentHorzFilter && currentVertFilter && originalImage) {
            // Use a small delay to avoid processing on every keystroke
            clearTimeout(window.gammaUpdateTimeout);
            window.gammaUpdateTimeout = setTimeout(function() {
                updateGammaFromTextarea();
                processImage();
            }, 500);
        }
    });
    
    // Add event listener for gamma search input
    document.getElementById('gammaSearch').addEventListener('input', function() {
        handleGammaSearch(this.value);
    });
});