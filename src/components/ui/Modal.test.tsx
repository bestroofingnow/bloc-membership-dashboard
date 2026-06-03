import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Modal } from './Modal';

afterEach(cleanup);

function Body() {
  return (
    <>
      <input data-testid="first" />
      <input data-testid="second" />
    </>
  );
}

describe('Modal focus management', () => {
  test('moves focus into the dialog on open (focus trap entry)', () => {
    render(
      <Modal isOpen onClose={() => {}} title="T">
        <Body />
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  test('does NOT steal focus when onClose identity changes on re-render', () => {
    // Reproduces the regression: callers pass inline arrow onClose props, so a
    // new identity arrives every parent render (e.g. each keystroke in a form).
    const { rerender } = render(
      <Modal isOpen onClose={() => {}} title="T">
        <Body />
      </Modal>
    );
    const second = screen.getByTestId('second') as HTMLInputElement;
    second.focus();
    expect(document.activeElement).toBe(second);

    // A re-render with a brand-new onClose function (what happens on every keystroke).
    rerender(
      <Modal isOpen onClose={() => {}} title="T">
        <Body />
      </Modal>
    );

    // Focus must stay where the user was typing, not jump back to the first field.
    expect(document.activeElement).toBe(second);
  });

  test('Escape invokes the LATEST onClose (read via ref, not a stale closure)', () => {
    const { rerender } = render(
      <Modal isOpen onClose={() => {}} title="T">
        <Body />
      </Modal>
    );
    const latest = vi.fn();
    rerender(
      <Modal isOpen onClose={latest} title="T">
        <Body />
      </Modal>
    );
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
