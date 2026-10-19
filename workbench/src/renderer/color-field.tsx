import ColorPicker from '@douyinfe/semi-ui-19/lib/es/colorPicker';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import './color-field.css';

const palette = ['#16181d', '#416dac', '#7048c6', '#d6336c', '#0f7b3b', '#a15c00', '#0a7ea4', '#ffffff', '#eceef1', '#edf3fc', '#f2ebfc', '#fce9ef', '#e6f4ea', '#fbf0dd'];
export function ColorField({label, value, disabled, onChange}: {label: string; value: string; disabled: boolean; onChange(value: string): void}) {
  const valid = /^#[\da-f]{6}$/i.test(value);
  return <div className="color-field" role="group" aria-label={label}>
    <span className="color-field-title">{label}</span>
    <div className="color-field-value"><span aria-hidden="true" style={{background: valid ? value : 'transparent'}}/><Input className="semi-control-text" aria-label={`${label}十六进制值`} disabled={disabled} required pattern="#[0-9a-fA-F]{6}" maxLength={7} value={value} onChange={next => {if (!disabled) onChange(next);}} placeholder="#416dac"/></div>
    {!valid && <small role="alert">请输入 # 加六位颜色值，或从下方选色。</small>}
    <div className="color-field-presets" aria-label={`${label}常用色`}>{palette.map(color => <Button key={color} htmlType="button" disabled={disabled} className="color-field-swatch" aria-label={`${label} ${color}`} aria-pressed={value.toLowerCase() === color} style={{background: color}} onClick={() => onChange(color)}>{value.toLowerCase() === color ? '✓' : ''}</Button>)}</div>
    <details><summary>自由选色</summary><fieldset disabled={disabled} style={{pointerEvents: disabled ? 'none' : undefined}}><ColorPicker width={240} height={125} alpha={false} eyeDropper={false} defaultFormat="hex" value={ColorPicker.colorStringToValue(valid ? value : '#416dac')} onChange={color => {if (!disabled) onChange(color.hex.toLowerCase());}}/></fieldset></details>
  </div>;
}
