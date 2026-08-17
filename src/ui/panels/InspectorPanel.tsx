import type { CardElement, FitMode, HAlign, TextElement, VAlign } from "../../core/types";
import { usePlaque } from "../../state/store";
import {
  CheckboxField,
  ColorField,
  Hint,
  NumberField,
  Panel,
  Row,
  SelectField,
  TextField,
} from "../controls";

/**
 * Properties of the selected element.
 *
 * Every canvas gesture has a numeric equivalent here. The drag is the
 * convenience; these numbers are the truth, and they are the only way to place
 * something to a tenth of a millimetre.
 */
export function InspectorPanel() {
  const { template, selectedId, headers, fonts, fontLabels, updateElement } = usePlaque();
  const element = template.elements.find((el) => el.id === selectedId);

  if (!element) {
    return (
      <Panel title="Selected element">
        <Hint>Click something on the card to edit it.</Hint>
      </Panel>
    );
  }

  const patch = (p: Partial<CardElement>) => updateElement(element.id, p);

  return (
    <Panel title="Selected element">
      <Row>
        <NumberField label="X" value={element.x} step={0.5} suffix="mm" onChange={(x) => patch({ x })} />
        <NumberField label="Y" value={element.y} step={0.5} suffix="mm" onChange={(y) => patch({ y })} />
      </Row>
      <Row>
        <NumberField
          label="Width"
          value={element.w}
          step={0.5}
          min={1}
          suffix="mm"
          onChange={(w) => patch({ w })}
        />
        <NumberField
          label="Height"
          value={element.h}
          step={0.5}
          min={1}
          suffix="mm"
          onChange={(h) => patch({ h })}
        />
      </Row>

      {element.kind === "text" && (
        <TextProperties
          element={element}
          headers={headers}
          fontOptions={[...fonts.keys()].map((id) => ({ value: id, label: fontLabels[id] ?? id }))}
          patch={patch}
        />
      )}

      {element.kind === "icon" && (
        <>
          <SelectField
            label="Read from column"
            value={element.sourceField}
            options={[
              { value: "", label: headers.length ? "Choose a column" : "Upload a CSV first" },
              ...headers.map((h) => ({ value: h, label: h })),
            ]}
            onChange={(sourceField) => patch({ sourceField })}
          />
          <ColorField label="Colour" value={element.colorHex} onChange={(c) => patch({ colorHex: c ?? "#000000" })} />
          <Hint>Which icon appears for each value is set under Dietary icons.</Hint>
        </>
      )}

      {(element.kind === "rect" || element.kind === "line") && (
        <>
          {element.kind === "rect" && (
            <ColorField label="Fill" value={element.fillHex} allowNone onChange={(fillHex) => patch({ fillHex })} />
          )}
          <ColorField
            label="Line colour"
            value={element.kind === "rect" ? element.strokeHex : element.strokeHex}
            allowNone={element.kind === "rect"}
            onChange={(strokeHex) => patch({ strokeHex: strokeHex ?? "#000000" })}
          />
          <Row>
            <NumberField
              label="Line width"
              value={element.strokeWidthMm}
              step={0.1}
              min={0}
              suffix="mm"
              onChange={(strokeWidthMm) => patch({ strokeWidthMm })}
            />
            <CheckboxField label="Dashed" checked={element.dashed} onChange={(dashed) => patch({ dashed })} />
          </Row>
        </>
      )}
    </Panel>
  );
}

function TextProperties({
  element,
  headers,
  fontOptions,
  patch,
}: {
  element: TextElement;
  headers: string[];
  fontOptions: Array<{ value: string; label: string }>;
  patch: (p: Partial<CardElement>) => void;
}) {
  return (
    <>
      <TextField
        label="Text"
        value={element.template}
        placeholder="{{First Name}}"
        onChange={(template) => patch({ template })}
      />
      {headers.length > 0 && (
        <Hint>
          Insert a column with double braces, e.g. <code>{"{{"}{headers[0]}{"}}"}</code>.
        </Hint>
      )}

      <SelectField label="Font" value={element.fontId} options={fontOptions} onChange={(fontId) => patch({ fontId })} />

      <Row>
        <NumberField
          label="Size"
          value={element.fontSizePt}
          step={0.5}
          min={1}
          suffix="pt"
          onChange={(fontSizePt) => patch({ fontSizePt })}
        />
        <NumberField
          label="Line height"
          value={element.lineHeight}
          step={0.05}
          min={0.5}
          onChange={(lineHeight) => patch({ lineHeight })}
        />
      </Row>

      <Row>
        <SelectField<HAlign>
          label="Align"
          value={element.align}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Centre" },
            { value: "right", label: "Right" },
          ]}
          onChange={(align) => patch({ align })}
        />
        <SelectField<VAlign>
          label="Vertically"
          value={element.vAlign}
          options={[
            { value: "top", label: "Top" },
            { value: "middle", label: "Middle" },
            { value: "bottom", label: "Bottom" },
          ]}
          onChange={(vAlign) => patch({ vAlign })}
        />
      </Row>

      <Row>
        <NumberField
          label="Letter spacing"
          value={element.letterSpacingMm}
          step={0.05}
          suffix="mm"
          onChange={(letterSpacingMm) => patch({ letterSpacingMm })}
        />
        <ColorField label="Colour" value={element.colorHex} onChange={(c) => patch({ colorHex: c ?? "#000000" })} />
      </Row>

      <SelectField<FitMode>
        label="If it does not fit"
        value={element.fit.mode}
        options={[
          { value: "shrink", label: "Shrink to fit" },
          { value: "wrap", label: "Wrap onto more lines" },
          { value: "shrink-then-wrap", label: "Wrap, then shrink" },
          { value: "none", label: "Leave it and warn me" },
        ]}
        onChange={(mode) => patch({ fit: { ...element.fit, mode } })}
      />

      <Row>
        <NumberField
          label="Never below"
          value={element.fit.minFontSizePt}
          step={0.5}
          min={1}
          suffix="pt"
          onChange={(minFontSizePt) => patch({ fit: { ...element.fit, minFontSizePt } })}
        />
        <NumberField
          label="Max lines"
          value={element.fit.maxLines}
          step={1}
          min={1}
          onChange={(maxLines) => patch({ fit: { ...element.fit, maxLines } })}
        />
      </Row>

      <Hint>
        Text shrinks around wherever it is aligned, so a centred name stays centred and a
        right-aligned one keeps its right edge.
      </Hint>
    </>
  );
}
