import { useState, type InputHTMLAttributes } from 'react';
import { IconEye, IconEyeOff } from './Icons';

/** Password field with a show/hide (eye) toggle. */
export default function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input {...props} className={`input ${props.className ?? ''}`} type={show ? 'text' : 'password'} />
      <button
        type="button" className="pw-eye" tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}
        onClick={() => setShow(!show)}
      >
        {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
      </button>
    </div>
  );
}
