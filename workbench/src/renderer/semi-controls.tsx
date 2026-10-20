import {Children, isValidElement, useRef, useState, useEffect, useId, type ReactNode} from 'react';
import Select from '@douyinfe/semi-ui-19/lib/es/select';
import InputNumber from '@douyinfe/semi-ui-19/lib/es/inputNumber';
import DatePicker, {type BaseDatePicker} from '@douyinfe/semi-ui-19/lib/es/datePicker';
import TimePicker from '@douyinfe/semi-ui-19/lib/es/timePicker';
import './semi-controls.css';

interface ControlProps {id?: string; value: string; onChange(value: string): void; disabled?: boolean; required?: boolean; className?: string; 'aria-label'?: string}
function useControl(onChange: (value: string) => void, disabled?: boolean, id?: string, ariaLabel?: string, closePopup?: () => void) {
  const ref = useRef<HTMLSpanElement>(null), nameId = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(ariaLabel ?? '请选择');
  useEffect(() => {
    const dialog = ref.current?.closest('dialog');
    if (!dialog) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || (event.target as Element).closest('dialog') !== dialog) return;
      if (!open && !ref.current?.contains(event.target as Node)) return;
      // Closed Semi triggers also swallow Escape; let the native dialog handle it.
      event.stopPropagation();
      if (!open) return;
      // Consume the popup's Escape before Chromium also cancels the native dialog.
      event.preventDefault();
      ref.current?.querySelector<HTMLElement>('[role="combobox"], .semi-input')?.focus();
      setOpen(false); closePopup?.();
    };
    dialog.addEventListener('keydown', escape, true);
    return () => dialog.removeEventListener('keydown', escape, true);
  }, [open, closePopup]);
  useEffect(() => {
    const source = ref.current?.closest('label') ?? (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null);
    const copy = source?.cloneNode(true) as HTMLElement | undefined;
    copy?.querySelectorAll('.semi-control').forEach(control => control.remove());
    setLabel(ariaLabel || copy?.textContent?.trim() || '请选择');
  }, [id, ariaLabel]);
  const popup = () => {
    const dialog = ref.current?.closest('dialog');
    if (!dialog) return document.body;
    let host = dialog.querySelector<HTMLDivElement>(':scope > .semi-dialog-popup-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'semi-dialog-popup-host';
      dialog.append(host);
    }
    return host;
  };
  const change = (value: string) => {
    if (disabled) return;
    onChange(value);
    // Semi callbacks do not emit native changes used by dialog draft guards.
    ref.current?.dispatchEvent(new Event('input', {bubbles: true}));
  };
  return {ref, popup, change, nameId, label, open, setOpen};
}
function ValidationInput({value, required, disabled, type = 'text', min, max}: Pick<ControlProps, 'value' | 'required' | 'disabled'> & {type?: string; min?: string; max?: string}) {
  const [invalid, setInvalid] = useState('');
  useEffect(() => {setInvalid('');}, [value]);
  return <><input className="semi-control-validation" aria-hidden="true" tabIndex={-1} type={type} value={value} required={required} disabled={disabled} min={min} max={max} step={type === 'datetime-local' ? 1 : undefined} onChange={() => {}} onInvalid={event => {event.preventDefault(); setInvalid(event.currentTarget.validity.valueMissing ? '请完成此项填写。' : '请检查填写格式或日期范围。'); event.currentTarget.parentElement?.querySelector<HTMLElement>('[role="combobox"], .semi-input')?.focus();}}/>{invalid && <span role="alert" className="semi-control-error">{invalid}</span>}</>;
}
export function PopupSelect({children, onChange, searchable = false, ...props}: ControlProps & {children: ReactNode; searchable?: boolean}) {
  const select = useRef<Select<string>>(null);
  const {ref, popup, change, nameId, label, setOpen} = useControl(onChange, props.disabled, props.id, props['aria-label'], () => select.current?.close());
  const options = Children.toArray(children).filter(isValidElement<{value: string; disabled?: boolean; children?: ReactNode}>).map(option => ({value: option.props.value, disabled: option.props.disabled, label: option.props.children}));
  return <span ref={ref} className="semi-control"><span id={nameId} className="semi-control-label">{label}</span><Select<string> {...props} ref={select} onDropdownVisibleChange={setOpen} aria-labelledby={nameId} aria-required={props.required} optionList={options} filter={searchable ? (input, option) => String(option.label ?? '').toLocaleLowerCase().includes(input.toLocaleLowerCase()) : false} virtualize={searchable ? {itemSize: 36, height: 252} : undefined} searchPlaceholder="搜索选项" emptyContent="没有匹配的选项" getPopupContainer={popup} onChange={value => {if (typeof value === 'string') change(value);}}/><ValidationInput {...props}/></span>;
}
export function PopupCreatableSelect({options, onChange, placeholder = '选择已有分类或直接输入', ...props}: ControlProps & {options: string[]; placeholder?: string}) {
  const select = useRef<Select<string>>(null);
  const {ref, popup, change, nameId, label, setOpen} = useControl(onChange, props.disabled, props.id, props['aria-label'], () => select.current?.close());
  // Semi caches created entries; filter keeps only saved options and the current draft visible.
  return <span ref={ref} className="semi-control semi-control-creatable" onKeyDownCapture={event => {
    // IME keys edit candidate text before Semi handles selection or dismissal.
    if (event.nativeEvent.isComposing || event.keyCode === 229) {event.stopPropagation(); return;}
    if (event.key === 'Enter') event.preventDefault();
  }} onKeyPressCapture={event => {if (event.key === 'Enter') {if (!event.nativeEvent.isComposing && event.keyCode !== 229) event.preventDefault(); event.stopPropagation();}}}><span id={nameId} className="semi-control-label">{label}</span><Select<string> {...props} ref={select} value={props.value || undefined} placeholder={placeholder} filter={(input, option) => (options.includes(String(option.value)) || option.value === props.value) && String(option.label).toLocaleLowerCase().includes(input.toLocaleLowerCase())} allowCreate showClear autoClearSearchValue={false} defaultActiveFirstOption={false} inputProps={{composition: true, 'aria-label': label}} optionList={options.filter(Boolean).map(value => ({value, label: value}))} onDropdownVisibleChange={setOpen} aria-labelledby={nameId} aria-required={props.required} getPopupContainer={popup} onSearch={(value, event) => {
    // Semi also calls onSearch while closing; only actual edits belong to the draft.
    if (event?.type === 'change' || event?.type === 'compositionend') change(value);
  }} onChange={value => {if (typeof value === 'string' || value === undefined) change(value ?? '');}}/><ValidationInput {...props}/></span>;
}
export function CalendarDateInput({onChange, min, max, ...props}: ControlProps & {min?: string; max?: string}) {
  const picker = useRef<BaseDatePicker>(null);
  const {ref, popup, change, nameId, label, setOpen} = useControl(onChange, props.disabled, props.id, props['aria-label'], () => picker.current?.close());
  return <span ref={ref} className="semi-control"><span id={nameId} className="semi-control-label">{label}</span><DatePicker {...props} ref={picker} onOpenChange={setOpen} aria-labelledby={nameId} type="date" format="yyyy-MM-dd" value={props.value ? new Date(`${props.value}T12:00:00`) : undefined} showClear={!props.required} inputReadOnly getPopupContainer={popup} disabledDate={date => {if (!date) return false; const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; return !!((min && day < min) || (max && day > max));}} onChange={(_, value) => change(typeof value === 'string' ? value : '')}/><ValidationInput {...props} type="date" min={min} max={max}/></span>;
}
export function ClockTimeInput({onChange, ...props}: ControlProps) {
  const {ref, popup, change, nameId, label, open, setOpen} = useControl(onChange, props.disabled, props.id, props['aria-label']);
  useEffect(() => {
    if (!open) return;
    // Controlled Semi TimePicker delegates outside-click closing to its caller.
    const outside = (event: MouseEvent) => { const target = event.target as Element; if (!ref.current?.contains(target) && !target.closest(`.${CSS.escape(nameId)}`)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open, nameId]);
  return <span ref={ref} className="semi-control"><span id={nameId} className="semi-control-label">{label}</span><TimePicker {...props} popupClassName={nameId} open={open} onOpenChange={setOpen} aria-labelledby={nameId} format="HH:mm" value={props.value || undefined} showClear={!props.required} inputReadOnly getPopupContainer={popup} onChange={(_, value) => change(typeof value === 'string' ? value : '')}/><ValidationInput {...props} type="time"/></span>;
}
export function UtcDateTimeInput({onChange, ...props}: ControlProps) {
  const picker = useRef<BaseDatePicker>(null);
  const {ref, popup, change, nameId, label, setOpen} = useControl(onChange, props.disabled, props.id, props['aria-label'], () => picker.current?.close());
  return <span ref={ref} className="semi-control"><span id={nameId} className="semi-control-label">{label}</span><DatePicker {...props} ref={picker} onOpenChange={setOpen} aria-labelledby={nameId} type="dateTime" format="yyyy-MM-dd HH:mm:ss" timeZone={0} value={props.value ? new Date(props.value) : undefined} showClear={!props.required} inputReadOnly getPopupContainer={popup} onChange={date => change(date instanceof Date ? date.toISOString() : '')}/><ValidationInput {...props} type="datetime-local" value={props.value.replace(/Z$/, '').slice(0, 19)}/></span>;
}

export function CoverCountInput({onChange, ...props}: Omit<ControlProps, 'value' | 'onChange'> & {value: number; onChange(value: number): void}) {
  return <span className="semi-control semi-control-text"><InputNumber {...props} min={1} max={20} step={1} precision={0} onChange={value => {if (!props.disabled) onChange(Number(value));}}/><ValidationInput {...props} value={String(props.value)} type="number" min="1" max="20"/></span>;
}
