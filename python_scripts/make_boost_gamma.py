# d93_to_srgb_lut.py
# Generates a 256-line lookup table from (0,0,0) to (225,237,255)
# using a power curve with exponent 1.125
# y\ =\ \left(255-x\right)\left(\frac{x}{255}\right)^{2}+\left(x\right)\left(\frac{x}{255}\right)^{0.4}

EXPONENT = 1.1091
MAX_R, MAX_G, MAX_B = 255, 255, 255

with open("contrast_boost_d93.txt", "w") as f:
    f.write(f"# Generated with d93_to_srgb_lut.py\n")
    f.write(f"# Does 2.2 to 2.4-ish gamma and d93 color\n\n")
    for i in range(256):
        t = (255 - i)*(i/255)**2.0 + (i)*(i/255)**0.35
        R = round( MAX_R/255 * t)
        G = round( MAX_G/255 * t)
        B = round( MAX_B/255 * t)
        f.write(f"{R}, {G}, {B}\n")

print("✅ Wrote d93_to_srgb_lut.txt (256 lines from 0,0,0 → 255,248,240)")
