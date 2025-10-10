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
    
    let width = 0, height = 0;
    const patternRows = [];
    
    for (let line of lines) {
        line = line.trim();
        if (line === '' || line.startsWith('#') || line.startsWith('####')) continue;
        
        // e.g., "2,5"
        if (line.match(/^\d+,\d+$/)) {
            const parts = line.split(',');
            width = parseInt(parts[0]);
            height = parseInt(parts[1]);
            continue;
        }
        
        // e.g., "54f,24f"
        if (line.includes(',')) {
            patternRows.push(line.split(','));
        }
    }
    
    if (width === 0 || height === 0) {
        throw new Error('Mask text missing width/height definition.');
    }
    
    const pattern = new Array(height);
    for (let y = 0; y < height; y++) {
        pattern[y] = new Array(width);
        for (let x = 0; x < width; x++) {
            pattern[y][x] = parseMask(patternRows[y][x]);
        }
    }
    
    return pattern;
}

// --- Apply the shadowmask pattern over an ImageData ---
function applyMaskToImage(imageData, pattern, is2x = false) {
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
let originalImage = null;
let scaledImageData = null;
let canvasContext = null;

// Default filter configuration - change these to set default filters
const DEFAULT_HORZ_FILTER_NAME = 'Upscaling - Lanczos Bicubic etc/lanczos3_10.txt'; // Set to filter name string for default horizontal filter
const DEFAULT_VERT_FILTER_NAME = 'Scanlines - Adaptive/SLA_Dk_040_Br_070.txt'; // Set to filter name string for default vertical filter
const DEFAULT_SHADOWMASK_NAME = 'Complex (Multichromatic)/Other/Stripe/MG Stripe (Magenta Green).txt'; // Set to filter name string for default vertical filter

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

async function processImage() {
    const inputFile = document.getElementById('inputImage').files[0];
    const outputWidth = parseInt(document.getElementById('outputWidth').value);
    const outputHeight = parseInt(document.getElementById('outputHeight').value);
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
        scaledImageData = scaleImage(imageData, currentHorzFilter, currentVertFilter, outputWidth, outputHeight);
        
        // Apply shadow mask if enabled and loaded
        if (applyShadowMask && currentShadowMask) {
            console.log('Applying shadow mask' + (shadowMask2x ? ' (2x)' : ''));
            scaledImageData = applyMaskToImage(scaledImageData, currentShadowMask, shadowMask2x);
        }
        
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
    
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    
    ctx.putImageData(imageData, 0, 0);
    
    // Add overlay text if enabled
    const showInfo = document.getElementById('showInfo').checked;
    if (showInfo) {
        addInfoOverlay(ctx, imageData.width, imageData.height);
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
    const applyShadowMask = document.getElementById('applyShadowMask').checked;
    const shadowMask2x = document.getElementById('shadowMask2x').checked;
    
    const infoText = [
        `Horizontal Filter: ${horzFilterName}`,
        `Vertical Filter: ${vertFilterName}`,
        `Shadow Mask: ${shadowMaskName}${applyShadowMask ? (shadowMask2x ? ' (2x)' : '') : ' (Off)'}`,
        `Output Resolution: ${outputWidth}x${outputHeight}`
    ];
    
    infoText.forEach((text, index) => {
        ctx.fillText(text, 10, 10 + index * 20);
    });
}

function saveImage() {
    if (!scaledImageData) {
        alert('No image to save. Please process an image first.');
        return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = scaledImageData.width;
    canvas.height = scaledImageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(scaledImageData, 0, 0);
    
    // Add overlay text if enabled
    const showInfo = document.getElementById('showInfo').checked;
    if (showInfo) {
        addInfoOverlay(ctx, scaledImageData.width, scaledImageData.height);
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
    
    // Clear existing options except the first one
    while (horzDropdown.options.length > 1) {
        horzDropdown.remove(1);
    }
    while (vertDropdown.options.length > 1) {
        vertDropdown.remove(1);
    }
    while (shadowMaskDropdown.options.length > 1) {
        shadowMaskDropdown.remove(1);
    }
    
    // Add embedded filters to dropdowns
    const filterNames = Object.keys(embeddedFilters).sort();
    filterNames.forEach(filterName => {
        const option1 = document.createElement('option');
        option1.value = filterName;
        option1.textContent = filterName;
        horzDropdown.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = filterName;
        option2.textContent = filterName;
        vertDropdown.appendChild(option2);
    });
    
    // Add embedded shadow masks to dropdown
    const shadowMaskNames = Object.keys(window.shadowmasks || {}).sort();
    shadowMaskNames.forEach(maskName => {
        const option = document.createElement('option');
        option.value = maskName;
        option.textContent = maskName;
        shadowMaskDropdown.appendChild(option);
    });
    
    // Select and load default filters
    if (filterNames.length > 0) {
        let horzFilterToLoad = filterNames[0];
        let vertFilterToLoad = filterNames[0];

        // Check if default horizontal filter name exists
        if (DEFAULT_HORZ_FILTER_NAME && filterNames.includes(DEFAULT_HORZ_FILTER_NAME)) {
            horzFilterToLoad = DEFAULT_HORZ_FILTER_NAME;
        }
        
        // Check if default vertical filter name exists
        if (DEFAULT_VERT_FILTER_NAME && filterNames.includes(DEFAULT_VERT_FILTER_NAME)) {
            vertFilterToLoad = DEFAULT_VERT_FILTER_NAME;
        }
        
        horzDropdown.value = horzFilterToLoad;
        vertDropdown.value = vertFilterToLoad;
        loadEmbeddedFilter('horz', horzFilterToLoad);
        loadEmbeddedFilter('vert', vertFilterToLoad);
    }
    
    // Load default shadow mask if available
    if (shadowMaskNames.length > 0) {
        
        let shadowmaskToLoad = shadowMaskNames[0];
        
        // Check if default shadowmask name exists
        if (DEFAULT_SHADOWMASK_NAME && shadowMaskNames.includes(DEFAULT_SHADOWMASK_NAME)) {
            shadowmaskToLoad = DEFAULT_SHADOWMASK_NAME;
        }

        shadowMaskDropdown.value = shadowmaskToLoad;
        loadEmbeddedShadowMask(shadowmaskToLoad);
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    canvasContext = document.getElementById('previewCanvas').getContext('2d');
    populateFilterDropdowns();
    
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
});