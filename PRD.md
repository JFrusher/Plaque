Product Overview & VisionThe Automated Place Card & Stationery Pipeline is an open-source, client-side-first web utility that converts guest CSV datasets into vector-accurate, print-ready PDF sheets. Commercial stationery platforms extract high fees for batch-populating guest names onto templates.This tool executes guest list ingestion, typography formatting, dietary icon mapping, and imposition layout (A4/Letter grid array with crop marks and fold guides) entirely inside the browser—delivering professional 300 DPI vector PDFs for home printing or local cardstock cutting.2. Target Personas & Use CasesDIY Couples: Printing place cards or tent cards on home printers or local print shops without paying per-card export fees on commercial platforms.Caterers & Venue Staff: Relying on visual indicators (e.g., dietary icons) on place cards to quickly serve special meals during multi-course receptions.3. Data Architecture & Core Logic3.1 CSV Schema Input ExampleCode snippetFirst Name,Last Name,Table,Dietary,Entree
Charis,Smith,Table 1,Vegetarian,Risotto
Alexander,Wright,Table 1,None,Beef
Eleanor,Vane,Table 2,Gluten-Free,Chicken
3.2 Imposition Layout Engine (A4 2x4 Tent Card Grid Math)TypeScriptinterface CardGeometry {
  widthMm: number;
  heightMm: number;
  isTentFold: boolean;
}

interface PageLayout {
  pageSize: "A4" | "LETTER";
  cols: number;
  rows: number;
  marginTopMm: number;
  marginLeftMm: number;
  horizontalGapMm: number;
  verticalGapMm: number;
}

interface Point {
  xMm: number;
  yMm: number;
}

function calculateCardPositions(
  cardIndexOnPage: number,
  layout: PageLayout,
  cardGeom: CardGeometry
): { origin: Point; cropMarks: Point[][] } {
  const col = cardIndexOnPage % layout.cols;
  const row = Math.floor(cardIndexOnPage / layout.cols);

  const x = layout.marginLeftMm + col * (cardGeom.widthMm + layout.horizontalGapMm);
  const y = layout.marginTopMm + row * (cardGeom.heightMm + layout.verticalGapMm);

  // Generate 4-corner crop mark line vectors (5mm length offset outside bleed)
  const markLength = 5;
  const cropMarks: Point[][] = [
    // Top-Left Corner
    [{ x: x - markLength, y }, { x, y }],
    [{ x, y: y - markLength }, { x, y }],
    // Top-Right Corner
    [{ x: x + cardGeom.widthMm, y }, { x: x + cardGeom.widthMm + markLength, y }],
    [{ x: x + cardGeom.widthMm, y: y - markLength }, { x: x + cardGeom.widthMm, y }],
    // Bottom-Left Corner
    [{ x: x - markLength, y: y + cardGeom.heightMm }, { x, y: y + cardGeom.heightMm }],
    [{ x, y: y + cardGeom.heightMm }, { x, y: y + cardGeom.heightMm + markLength }],
    // Bottom-Right Corner
    [{ x: x + cardGeom.widthMm, y: y + cardGeom.heightMm }, { x: x + cardGeom.widthMm + markLength, y: y + cardGeom.heightMm }],
    [{ x: x + cardGeom.widthMm, y: y + cardGeom.heightMm }, { x: x + cardGeom.widthMm, y: y + cardGeom.heightMm + markLength }]
  ];

  return { origin: { xMm: x, yMm: y }, cropMarks };
}
4. Feature RequirementsFeature IDCategoryDescriptionPriorityFR-STA-01Data IngestionDrag-and-drop CSV upload with field mapping for First Name, Last Name, Table, and Dietary Requirements.P0FR-STA-02Geometry EngineSupport Flat Place Cards (85x55mm) and Tent Folded Cards (85x110mm) on A4 and Letter grids.P0FR-STA-03Text FittingAuto-scaling font size logic for long guest names to prevent container overflow.P0FR-STA-04Tent InversionAutomatic 180° rotation of guest text on the top half of tent folded cards for double-sided viewing.P0FR-STA-05Icon MappingConditional rendering of custom SVG icons based on CSV dietary values (e.g., Vegetarian -> Leaf SVG).P1FR-STA-06Crop GuidesRender hairline crop marks, cut lines, and dashed fold guides on output PDF sheets.P1FR-STA-07Font UploadAllow users to load custom local font files (.ttf, .otf, .woff2) for vector PDF rendering.P25. UI/UX Wireframe Specification5.1 Main Layout (/place-cards)Left Control Sidebar:Data Ingestion Box: CSV parser status, mapped column dropdowns, character overflow alerts.Card Geometry Selector: Card type (Flat vs. Tent), card size dropdown, target sheet format (A4 / Letter), crop mark toggles.Typography & Icon Builder: Font family picker, size controls, conditional dietary icon rules.Action Bar: Primary 📄 Download Print-Ready PDF button.Main Canvas Preview:Real-time vector preview showing Sheet 1 of $N$.Visual overlays displaying crop mark crosshairs, fold lines, and bleed boundary guides.Interactive pagination controls (< Prev Sheet, Next Sheet >).6. Shared Non-Functional Requirements & SecurityZero-Backend Execution: All data manipulation, graph logic, and PDF generation must execute client-side in browser memory. No user, guest, or schedule data may be transmitted to external servers.Storage: Local application state persisted via browser localStorage and client-side JSON file exports.Browser Compatibility: Chrome, Safari, Firefox, Edge, and iOS/Android mobile web browsers.Performance Benchmark:Timeline Recalculation: $< 16\text{ms}$ for up to 200 event nodes (60 FPS rendering).PDF Generation: $< 3.0\text{s}$ for a 150-guest (15-page) PDF export on desktop devices.