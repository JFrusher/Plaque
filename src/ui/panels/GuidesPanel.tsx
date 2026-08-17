import { useShallow } from "zustand/react/shallow";
import { usePlaque } from "../../state/store";
import { CheckboxField, ColorField, Hint, Panel } from "../controls";

/** FR-STA-06, plus the card background. */
export function GuidesPanel() {
  const { sheet, setSheet, backgroundHex, setBackground, snapEnabled, toggleSnap } = usePlaque(
    useShallow((s) => ({
      sheet: s.sheet,
      setSheet: s.setSheet,
      // Only the background, so dragging an element does not redraw this panel.
      backgroundHex: s.template.backgroundHex,
      setBackground: s.setBackground,
      snapEnabled: s.snapEnabled,
      toggleSnap: s.toggleSnap,
    })),
  );

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

      <CheckboxField
        label="Slug line (PDF only)"
        checked={sheet.slugLine}
        onChange={(slugLine) => setSheet({ slugLine })}
        hint="Prints sizes, fold, applied printer scale, card count, build hash and a 100mm rule along the foot of each sheet."
      />
      <Hint>
        Turn the slug line on for a test print: if its 100mm rule does not measure 100mm, the printer
        driver is scaling the page.
      </Hint>

      <ColorField
        label="Card background"
        value={backgroundHex}
        allowNone
        onChange={setBackground}
      />

      <CheckboxField label="Snap while dragging" checked={snapEnabled} onChange={toggleSnap} />
    </Panel>
  );
}
