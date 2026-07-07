---
name: Precision & Clarity
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#3d484f'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#6d7980'
  outline-variant: '#bcc8d1'
  surface-tint: '#006688'
  primary: '#006688'
  on-primary: '#ffffff'
  primary-container: '#00c2ff'
  on-primary-container: '#004c66'
  inverse-primary: '#75d1ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#505f76'
  on-tertiary: '#ffffff'
  tertiary-container: '#a5b6cf'
  on-tertiary-container: '#38475d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c2e8ff'
  primary-fixed-dim: '#75d1ff'
  on-primary-fixed: '#001e2b'
  on-primary-fixed-variant: '#004d67'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  container-max: 1280px
---

## Brand & Style

This design system is built on the pillars of industrial reliability, technical precision, and modern craftsmanship. It is designed for professional environments where clarity of information and speed of execution are paramount. The aesthetic is **Corporate / Modern** with a lean toward **Minimalism**, stripping away unnecessary ornamentation to focus on the structural integrity of the interface.

The target audience consists of specialists, project managers, and technicians who value efficiency. The UI should evoke a sense of "engineered confidence"—feeling as stable and well-constructed as a piece of architectural hardware. By combining high-contrast technical typography with a vibrant, high-energy primary blue, the design system strikes a balance between traditional industrial expertise and forward-thinking digital utility.

## Colors

The palette is anchored by a vibrant, "Electric Cyan" primary color, pulled directly from the brand’s visual identity. This color is used sparingly but impactfully for primary actions, focus states, and key data points.

To ground this high-energy blue, the system utilizes a "Steel" neutral scale. Deep slates and navy tones replace previous purples to provide a more professional, industrial foundation.
- **Primary:** High-visibility Cyan for interaction.
- **Secondary:** Deep Navy for headers, text, and structural grounding.
- **Surface:** A range of cool grays (Slate) to define hierarchy without relying on heavy shadows.
- **Status:** Standardized semantic colors (Green for success, Red for error, Amber for warning) are tuned for high legibility against the light background.

## Typography

The design system exclusively utilizes **Hanken Grotesk** to maintain a cohesive, engineered look. The typeface's geometric clarity ensures readability in high-density data views.

- **Headlines:** Use Bold and SemiBold weights with slightly tightened letter spacing to create a strong visual "anchor" for pages.
- **Body:** Regular weight with generous line height for long-form readability.
- **Labels:** Small caps or uppercase styling is encouraged for metadata and technical specs to differentiate secondary information from primary content.
- **Mobile scaling:** Headline sizes are reduced by approximately 20% on mobile devices to prevent awkward wrapping while maintaining hierarchy.

## Layout & Spacing

The layout is governed by a **12-column fluid grid** for desktop and a **4-column grid** for mobile. The spacing rhythm is strictly based on an 8px incremental scale, ensuring that all elements align to a predictable technical grid.

- **Desktop:** 12 columns with 24px gutters. Content should be centered within a 1280px max-width container for optimal readability.
- **Tablet:** 8 columns with 20px gutters.
- **Mobile:** 4 columns with 16px margins.
- **Density:** For industrial applications (dashboards/tables), use a high-density "compact" mode where vertical padding is reduced by 50% (e.g., from 16px to 8px).

## Elevation & Depth

To maintain a clean and professional aesthetic, the design system avoids heavy shadows. Instead, it uses **Tonal Layers** and **Low-Contrast Outlines**.

1.  **Surfaces:** The primary background is the lightest neutral. Secondary containers use a slightly darker tint (Slate 50 or 100) to create separation.
2.  **Borders:** Use subtle 1px borders in Slate 200 to define card boundaries and input fields.
3.  **Active State:** When an element requires elevation (e.g., a modal or a floating action button), use a very soft, diffused shadow: `0px 4px 12px rgba(15, 23, 42, 0.08)`.
4.  **Glassmorphism:** Reserved only for persistent navigation bars or overlays to maintain context with the content beneath, using a 12px backdrop-blur.

## Shapes

The shape language reflects the "Precision" aspect of the brand. A **Soft** roundedness (0.25rem / 4px) is the standard for almost all UI components. This small radius keeps the interface feeling modern and approachable without losing the "sharp" and disciplined feel of industrial design.

- **Standard (4px):** Buttons, inputs, chips, and small cards.
- **Large (8px):** Main content containers and modals.
- **Pill:** Reserved exclusively for status tags (e.g., "Active," "Pending") to distinguish them from interactive buttons.

## Components

### Buttons
Primary buttons use the brand Cyan with white text. Secondary buttons use a ghost style with a Slate 200 border. Transitions should be immediate (150ms) to feel responsive and "mechanical."

### Input Fields
Inputs are rectangular with 1px Slate 200 borders. On focus, the border transitions to the primary Cyan with a 2px outer glow of the same color at 20% opacity. Labels are always persistent—never use floating placeholders.

### Chips & Tags
Used for filtering and categorization. They utilize a light tint of the primary color (Cyan at 10% opacity) with the text in a darker navy for maximum contrast.

### Lists & Tables
The core of the industrial experience. Tables should use zebra-striping (Slate 50) and have 1px horizontal dividers. Headers are styled with `label-md` for clear categorization.

### Cards
Cards are flat with a 1px border. No shadows should be used for static cards; they rely on the background color of the page to create contrast.
