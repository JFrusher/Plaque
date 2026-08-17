import { usePlaque } from "../../state/store";
import { CheckboxField, ColorField, Hint, Panel } from "../controls";

/** FR-STA-06, plus the card background. */
export function GuidesPanel() {
  const { sheet, setSheet, template, setBackground, snapEnabled, toggleSnap } = usePlaque();

  return (
    <Panel title="Guides and background" open={false}>
      <CheckboxField
        label="Crop marks"
        checked={sheet.cropMarks}
        onChange={(cropMarks) => setSheet({ cropMarks })}
      />
      <CheckboxField
        label="Cut lines"
        checked={sheet.cutLines}
        onChange={(cutLines) => setSheet({ cutLines })}
      />
      <CheckboxField
        label="Fold guides"
        checked={sheet.foldGuides}
        onChange={(foldGuides) => setSheet({ foldGuides })}
      />
      <CheckboxField
        label="Bleed boundary (preview only)"
        checked={sheet.bleedGuides}
        onChange={(bleedGuides) => setSheet({ bleedGuides })}
      />
      <Hint>The bleed boundary is an on-screen aid. It is never drawn into the PDF.</Hint>

      <ColorField
        label="Card background"
        value={template.backgroundHex}
        allowNone
        onChange={setBackground}
      />

      <CheckboxField label="Snap while dragging" checked={snapEnabled} onChange={toggleSnap} />
    </Panel>
  );
}
