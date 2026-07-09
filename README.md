# Solid vs Surface Modeling

## Overview

This repository contains an interactive web-based educational program that demonstrates and compares **Solid Modeling** and **Surface Modeling** techniques used in professional CAD systems (e.g., SolidWorks, CATIA, Fusion 360, Rhino 3D, Onshape).

The program was specified via GitHub MCP by a previous agent and is now fully built, tested, and validated exclusively through CI/CD pipelines on GitHub Actions (no local machine builds required beyond initial setup).

**Live Demo:** Once deployed to GitHub Pages, it will be available at the Pages URL.

## What is Solid vs Surface Modeling?

### Solid Modeling
- **Paradigm**: Boundary Representation (B-Rep) + Constructive Solid Geometry (CSG) + History-based parametric modeling.
- **Core**: Closed, watertight volumes with full topological information (faces, edges, vertices, adjacency).
- **Strengths**:
  - Reliable boolean operations (union, subtract, intersect)
  - Automatic mass properties (volume, center of mass, inertia)
  - Manufacturing-ready (toolpaths, mold design, FEA)
  - Feature-based editing with full history tree
- **Use Cases**: Mechanical parts, assemblies, engineering, 3D printing, CNC

### Surface Modeling
- **Paradigm**: NURBS / Bezier / B-Spline patches, often open or multi-patch quilts.
- **Core**: Mathematical surfaces defined by control points, knots, degrees. Can be trimmed, extended, blended.
- **Strengths**:
  - Precise free-form / organic / Class-A surfaces (car bodies, consumer products, aerospace)
  - Local control and high continuity (G2/G3)
  - Easier to create complex curves and lofts
- **Weaknesses**: Can have gaps, non-watertight, harder to compute volumes without closing, manual stitching often needed
- **Use Cases**: Industrial design, automotive styling, ship hulls, animation characters

**Key Insight**: Modern CAD often uses *hybrid* approaches. Solid for structure + Surface for aesthetics.

## Program Features (Implemented per Spec)

- **Dual Interactive 3D Viewers** (Three.js):
  - Left: Solid Model (closed manifold meshes, solid shading, volume emphasis)
  - Right: Surface Model (NURBS-approximated patches via parametric meshes, wireframe + control polygons, boundary edges highlighted)
  - Synced camera controls (orbit, pan, zoom) with option to link/unlink

- **Model Library**:
  - Box (prism)
  - Cylinder
  - Sphere
  - Torus
  - L-Bracket (compound solid/surface)
  - Custom parametric (sliders for dimensions)

- **Paradigm-Specific Operations** (applied live):
  - **Solid**: Boolean subtract (hole), Fillet/Chamfer (edge rounding via geometry modification), Extrude feature simulation
  - **Surface**: Patch subdivision/refinement, Trim (cut with curve), Extend, Join (show stitching artifacts/gaps)
  - Common: Transform (translate/rotate/scale), Toggle wireframe, Show normals, Section cut

- **Live Metrics Dashboard**:
  - Solid: Calculated volume, surface area, watertight status, Euler number, bounding box
  - Surface: Patch count, total area, boundary length, open/closed status, continuity estimate
  - Side-by-side comparison table with deltas

- **Educational Tools**:
  - Theory popovers / expandable sections explaining B-Rep vs NURBS math
  - "Highlight Topology" mode: clicks highlight faces/edges in solid vs patches/trim curves in surface
  - Operation history log (like feature tree vs patch tree)
  - Mini-quiz: "Which modeling paradigm is better for X?"

- **Export & Sharing**:
  - Screenshot (PNG) of both views
  - Export Solid as STL/OBJ
  - Export Surface as OBJ (with UVs if applicable)
  - Shareable URL state (model + params encoded)

- **Technical Quality**:
  - TypeScript + Vite for fast modern build
  - Responsive design (desktop primary, tablet friendly)
  - 60 FPS smooth interaction
  - Comprehensive tests (unit for geometry utils + e2e smoke)
  - Fully CI/CD driven: GitHub Actions builds, lints, tests, and can deploy

## Repository Structure

```
.github/
  workflows/
    ci.yml                 # Build, lint, test on push/PR
    pages.yml              # Optional deploy to GitHub Pages
src/
  main.ts                  # App entry, Three.js setup, UI wiring
  geometry/
    solid.ts               # Solid model generators + ops (Box, Cylinder, CSG sim, fillet)
    surface.ts             # Surface (parametric NURBS approx, patch generators, trim)
    common.ts              # Shared types, utils, metrics calculators
  ui/
    controls.ts            # lil-gui or custom controls, event handlers
    metrics.ts             # Live metrics panel updater
  styles.css
index.html
package.json
vite.config.ts
README.md
LICENSE
.gitignore
```

## Getting Started (for contributors)

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build & Test (CI/CD enforced)

```bash
npm run build
npm test
npm run lint
```

All must pass before merge. The CI workflow enforces this.

## How This Was Built

- Spec created and iterated via GitHub Issues/MCP
- Implementation done entirely by pushing to main and validating via GitHub Actions CI runs
- No local `npm run dev` or machine builds; only browser + GitHub MCP tools + CI feedback loop
- Iterations continued until all features complete, tests green, and program fully functional

## Future Enhancements (Post-MVP)
- Real OpenCASCADE.wasm or Manifold + Three.js for true solid boolean
- NURBS.js or verb-nurbs for accurate surface math
- VR/AR mode
- Import STEP/IGES (limited)
- Collaboration on models

## License

MIT License - see LICENSE file

## Acknowledgments

Built with Three.js, Vite, TypeScript. Inspired by CAD education tools and professional modeling kernels.

---

**Status**: COMPLETE - All core spec implemented, CI green, ready for use and further extension.
