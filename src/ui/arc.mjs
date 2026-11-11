// UIArc Button and RadioGroup: MIT, Elia Kuratli. See LICENSE.
// Native React adaptation of the existing UIArc markup and CSS. Motion-only
// label morphs and the travelling radio highlight are omitted for the host.
import React from 'react';
import button from './button.module.css';
import radio from './radio-group.module.css';
const h = React.createElement;
export function Button({ variant = 'secondary', size = 'sm', children, className = '', ...props }) {
  return h('button', { type: 'button', ...props, className: [button.button, button[variant], button[size], className].join(' ') }, children);
}
export function RadioGroup({ label, options, value, onValueChange, name, disabled }) {
  return h('fieldset', { className: radio.group, disabled }, h('legend', null, label),
    h('div', { className: radio.options }, ...options.map(option =>
      h('label', { className: radio.option, key: option.value },
        h('input', { type: 'radio', name, value: option.value, checked: value === option.value, onChange: () => onValueChange(option.value) }),
        h('span', { className: radio.mark, 'aria-hidden': true }, value === option.value ? h('span', { className: radio.dot }) : null),
        h('span', null, h('strong', null, option.label))))));
}
