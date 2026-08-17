import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { defaultFoldPosition } from "../../core/geometry/fold";
import { computeLayout } from "../../core/geometry/pageLayout";
import { suggestLayouts } from "../../core/geometry/suggestLayouts";
import { STOCK_PRESETS, applyPreset } from "../../core/data/stockPresets";
import { CARD_PRESETS, applyCardPreset } from "../../core/data/cardPresets";
import { GALLERY } from "../../core/data/gallery";
import type { FoldAxis, Orientation, PageSizeName } from "../../core/types";
import { usePlaque } from "../../state/store";
import { CheckboxField, Hint, NumberField, Panel, Row, SelectField } from "../controls";
import styles from "./GeometryPanel.module.css";

/** FR-STA-02. Any card size, any fold, plus layouts that maximise cards per sheet. */
export function GeometryPanel() {
  const { card, sheet, setCard, setSheet, applySuggestion, applyGalleryTemplate } = usePlaque(
    useShallow((s) => ({
      card: s.card,
      sheet: s.sheet,
      setCard: s.setCard,
      setSheet: s.setSheet,
      applySuggestion: s.applySuggestion,
      applyGalleryTemplate: s.applyGalleryTemplate,
    })),
  );

  const suggestions = useMemo(
    () => suggestLayouts(card, { printerMarginMm: sheet.printerMarginMm, maxResults: 4 }),
    [card, sheet.printerMarginMm],
  );
  const layout = useMemo(() => computeLayout(card, sheet), [card, sheet]);
  const foldSpan = card.fold === "vertical" ? card.widthMm : card.heightMm;

  return (
    <>
      <Panel title="Card">
        <SelectField
          label="Start from a design"
          value=""
          options={[
            { value: "", label: "Keep the current design" },
            ...GALLERY.map((t) => ({ value: t.id, label: t.name })),
          ]}
          onChange={(id) => {
            const entry = GALLERY.find((t) => t.id === id);
            if (entry) applyGalleryTemplate(entry);
          }}
        />
        <Hint>
          Replaces the design and the card size, then re-attaches every token to your own columns.
          Undo puts it back.
        </Hint>

        <SelectField
          label="What are you making?"
          value=""
          options={[
            { value: "", label: "Custom size" },
            ...CARD_PRESETS.map((p) => ({ value: p.id, label: p.name })),
          ]}
          onChange={(id) => {
            const preset = CARD_PRESETS.find((p) => p.id === id);
            if (preset) setCard(applyCardPreset(preset));
          }}
        />
        <Hint>Presets set the size and the fold. Everything stays editable afterwards.</Hint>

        <Row>
          <NumberField
            label="Width"
            value={card.widthMm}
            step={0.5}
            min={5}
            suffix="mm"
            onChange={(widthMm) => setCard({ widthMm })}
          />
          <NumberField
            label="Height"
            value={card.heightMm}
            step={0.5}
            min={5}
            suffix="mm"
            onChange={(heightMm) => setCard({ heightMm })}
          />
        </Row>

        <Row>
          <SelectField<FoldAxis>
            label="Fold"
            value={card.fold}
            options={[
              { value: "none", label: "Flat card" },
              { value: "horizontal", label: "Tent (folds across)" },
              { value: "vertical", label: "Folds down the middle" },
            ]}
            onChange={(fold) => setCard({ fold })}
          />
          <NumberField
            label="Fold at"
            value={card.foldPositionMm}
            step={0.5}
            min={1}
            max={foldSpan - 1}
            suffix="mm"
            onChange={(foldPositionMm) => setCard({ foldPositionMm })}
          />
        </Row>

        {card.fold !== "none" && (
          <>
            <CheckboxField
              label="Rotate the back panel 180°"
              checked={card.invertBackPanel}
              disabled={card.fold === "vertical"}
              onChange={(invertBackPanel) => setCard({ invertBackPanel })}
              hint={
                card.fold === "vertical"
                  ? "A fold down the middle mirrors the back panel rather than rotating it."
                  : undefined
              }
            />
            <Hint>
              {card.fold === "vertical"
                ? "A fold down the middle turns the back panel into a mirror image, which no rotation can fix, so this does not apply."
                : "The editor shows both panels the right way up. The back one is rotated when the sheet is imposed, so it reads from across the table."}
            </Hint>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setCard({ foldPositionMm: defaultFoldPosition(card) })}
            >
              Centre the fold
            </button>
          </>
        )}

        <NumberField
          label="Bleed"
          value={card.bleedMm}
          step={0.5}
          min={0}
          suffix="mm"
          onChange={(bleedMm) => setCard({ bleedMm })}
        />
      </Panel>

      <Panel title="Sheet">
        <SelectField
          label="Pre-cut stock"
          value=""
          options={[
            { value: "", label: "None — plain sheets, cut them yourself" },
            ...STOCK_PRESETS.map((p) => ({ value: p.id, label: p.name })),
          ]}
          onChange={(id) => {
            const preset = STOCK_PRESETS.find((p) => p.id === id);
            if (!preset) return;
            const applied = applyPreset(preset);
            setCard(applied.card);
            setSheet(applied.sheet);
          }}
        />
        <Hint>
          A preset sets the card size and the grid, and turns crop marks off — the cutting already
          happened. Prove it with "Two test cards" on plain paper held against the real sheet before
          feeding stock you paid for.
        </Hint>

        {suggestions.length > 0 && (
          <div className={styles.suggestions}>
            <span className={styles.suggestionsLabel}>Fits best</span>
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className={
                  s.page === sheet.page &&
                  s.orientation === sheet.orientation &&
                  s.cardRotationDeg === sheet.cardRotationDeg
                    ? `${styles.suggestion} ${styles.active}`
                    : styles.suggestion
                }
                onClick={() => applySuggestion(s)}
              >
                <strong>{s.perSheet} per sheet</strong>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}

        <Row>
          <SelectField<PageSizeName>
            label="Paper"
            value={sheet.page}
            options={[
              { value: "A4", label: "A4" },
              { value: "LETTER", label: "US Letter" },
            ]}
            onChange={(page) => setSheet({ page })}
          />
          <SelectField<Orientation>
            label="Orientation"
            value={sheet.orientation}
            options={[
              { value: "portrait", label: "Portrait" },
              { value: "landscape", label: "Landscape" },
            ]}
            onChange={(orientation) => setSheet({ orientation })}
          />
        </Row>

        <CheckboxField
          label="Turn cards 90° on the sheet"
          checked={sheet.cardRotationDeg === 90}
          onChange={(on) => setSheet({ cardRotationDeg: on ? 90 : 0 })}
        />

        <Row>
          <NumberField
            label="Margin top"
            value={sheet.marginTopMm}
            step={0.5}
            min={0}
            suffix="mm"
            onChange={(marginTopMm) => setSheet({ marginTopMm })}
          />
          <NumberField
            label="Margin bottom"
            value={sheet.marginBottomMm}
            step={0.5}
            min={0}
            suffix="mm"
            onChange={(marginBottomMm) => setSheet({ marginBottomMm })}
          />
        </Row>
        <Row>
          <NumberField
            label="Margin left"
            value={sheet.marginLeftMm}
            step={0.5}
            min={0}
            suffix="mm"
            onChange={(marginLeftMm) => setSheet({ marginLeftMm })}
          />
          <NumberField
            label="Margin right"
            value={sheet.marginRightMm}
            step={0.5}
            min={0}
            suffix="mm"
            onChange={(marginRightMm) => setSheet({ marginRightMm })}
          />
        </Row>
        <Row>
          <NumberField
            label="Gap across"
            value={sheet.gapXMm}
            step={0.5}
            min={0}
            suffix="mm"
            onChange={(gapXMm) => setSheet({ gapXMm })}
          />
          <NumberField
            label="Gap down"
            value={sheet.gapYMm}
            step={0.5}
            min={0}
            suffix="mm"
            onChange={(gapYMm) => setSheet({ gapYMm })}
          />
        </Row>
        <NumberField
          label="Printer's unprintable border"
          value={sheet.printerMarginMm}
          step={0.5}
          min={0}
          suffix="mm"
          onChange={(printerMarginMm) => setSheet({ printerMarginMm })}
        />

        <Hint>
          {layout.perSheet > 0
            ? `${layout.cols} × ${layout.rows} — ${layout.perSheet} cards per sheet.`
            : "No cards fit at these settings."}
        </Hint>
      </Panel>
    </>
  );
}
