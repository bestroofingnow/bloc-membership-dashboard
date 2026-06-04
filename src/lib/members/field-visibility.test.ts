import { describe, test, expect } from 'vitest';
import {
  projectFieldVisibility,
  parseFieldVisibilityInput,
  type FieldVisibilityFlags,
  type ViewerContext,
  type PersonalFields,
} from './field-visibility';

const personal: PersonalFields = {
  mobile_phone: '704-555-1212',
  address: '1 Main St',
  birthday: '03/14',
};

const allHidden: FieldVisibilityFlags = {
  show_mobile_phone: false,
  show_address: false,
  show_birthday: false,
};

describe('projectFieldVisibility()', () => {
  test('owner sees every personal field regardless of flags', () => {
    const viewer: ViewerContext = { isStaff: false, isOwner: true };
    expect(projectFieldVisibility(personal, allHidden, viewer)).toEqual(personal);
  });

  test('staff (admin/director) sees every personal field regardless of flags', () => {
    const viewer: ViewerContext = { isStaff: true, isOwner: false };
    expect(projectFieldVisibility(personal, allHidden, viewer)).toEqual(personal);
  });

  test('non-owner non-staff sees nulls when all flags are false (default = hidden)', () => {
    const viewer: ViewerContext = { isStaff: false, isOwner: false };
    expect(projectFieldVisibility(personal, allHidden, viewer)).toEqual({
      mobile_phone: null,
      address: null,
      birthday: null,
    });
  });

  test('non-owner non-staff sees only the opted-in fields', () => {
    const viewer: ViewerContext = { isStaff: false, isOwner: false };
    const flags: FieldVisibilityFlags = {
      show_mobile_phone: true,
      show_address: false,
      show_birthday: true,
    };
    expect(projectFieldVisibility(personal, flags, viewer)).toEqual({
      mobile_phone: '704-555-1212',
      address: null,
      birthday: '03/14',
    });
  });

  test('mobile_phone is a personal (opt-in) field, never always-visible', () => {
    const viewer: ViewerContext = { isStaff: false, isOwner: false };
    const flags: FieldVisibilityFlags = {
      show_mobile_phone: false,
      show_address: true,
      show_birthday: true,
    };
    expect(projectFieldVisibility(personal, flags, viewer).mobile_phone).toBeNull();
  });
});

describe('parseFieldVisibilityInput()', () => {
  test('coerces present booleans and defaults missing ones to false', () => {
    expect(parseFieldVisibilityInput({ show_address: true })).toEqual({
      show_mobile_phone: false,
      show_address: true,
      show_birthday: false,
    });
  });

  test('ignores non-boolean junk and never returns undefined flags', () => {
    expect(
      parseFieldVisibilityInput({ show_mobile_phone: 'yes', show_birthday: 1, extra: 'x' } as unknown as Record<string, unknown>)
    ).toEqual({
      show_mobile_phone: false,
      show_address: false,
      show_birthday: false,
    });
  });
});
