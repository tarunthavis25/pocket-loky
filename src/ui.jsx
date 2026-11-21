import React from 'react';

export function Brand() {
  return <div className="brand"><span className="brand-icon" aria-hidden="true"><i /></span>Pocket Loky</div>;
}

export const ease = [0.22, 1, 0.36, 1];
export const entrance = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.38, ease }
};
