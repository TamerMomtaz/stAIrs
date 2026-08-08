/**
 * Invitation sign-up and admin management.
 *
 * The failure paths matter more than the happy one here: a token that is
 * expired, used, revoked or simply wrong must SAY SO and must never quietly
 * create a separate organisation. That is how an invited colleague ends up
 * alone in an empty workspace wondering where their team's data went.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const signup = vi.fn();
const preview = vi.fn();
const listInvites = vi.fn();
const createInvite = vi.fn();
const revokeInvite = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    api: { ...actual.api, signup: (...a) => signup(...a), login: vi.fn(), user: null },
    InvitesAPI: {
      preview: (...a) => preview(...a),
      list: (...a) => listInvites(...a),
      create: (...a) => createInvite(...a),
      revoke: (...a) => revokeInvite(...a),
    },
  };
});

const { LoginScreen } = await import('../components/LoginScreen');
const { InviteManager } = await import('../components/InviteManager');

const setUrl = (search) => {
  window.history.replaceState({}, '', `/${search}`);
};

const gotoSignup = () => {
  render(<LoginScreen onLogin={() => {}} />);
  fireEvent.click(screen.getByText('Create Account'));
};

const fillAccount = () => {
  fireEvent.change(screen.getByPlaceholderText('Full Name'), { target: { value: 'Sam' } });
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'sam@acme.test' } });
  fireEvent.change(screen.getByPlaceholderText('Password (min 8 characters)'), { target: { value: 'stairs2026!' } });
  fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: 'stairs2026!' } });
};

const submit = () => fireEvent.click(screen.getByTestId('signup-submit'));

beforeEach(() => {
  signup.mockReset().mockResolvedValue({});
  preview.mockReset();
  listInvites.mockReset().mockResolvedValue([]);
  createInvite.mockReset();
  revokeInvite.mockReset().mockResolvedValue({});
  setUrl('');
});
afterEach(cleanup);

describe('signup — organisation name', () => {
  it('asks for one instead of naming the org after the person', async () => {
    gotoSignup();
    expect(screen.getByTestId('org-name-input')).toBeTruthy();
  });

  it('refuses to submit without one', async () => {
    gotoSignup();
    fillAccount();
    submit();
    expect(await screen.findByTestId('signup-error')).toHaveTextContent(/Organisation name is required/i);
    expect(signup).not.toHaveBeenCalled();
  });

  it('sends the organisation name when creating a new workspace', async () => {
    gotoSignup();
    fillAccount();
    fireEvent.change(screen.getByTestId('org-name-input'), { target: { value: 'Acme Corp' } });
    submit();
    await waitFor(() => expect(signup).toHaveBeenCalled());
    expect(signup.mock.calls[0][4]).toEqual({ orgName: 'Acme Corp' });
  });
});

describe('signup — joining by invitation', () => {
  it('resolves an ?invite= link and offers to join that organisation', async () => {
    preview.mockResolvedValue({ valid: true, organization_name: 'Acme Corp', role: 'member', email: null });
    setUrl('?invite=good-token');
    render(<LoginScreen onLogin={() => {}} />);
    expect(await screen.findByTestId('invite-valid')).toHaveTextContent(/invited to join Acme Corp/i);
    // Joining an existing org means not naming a new one.
    expect(screen.queryByTestId('org-name-input')).toBeNull();
    expect(screen.getByTestId('signup-submit')).toHaveTextContent('Join Acme Corp');
  });

  it('sends the token, not an org name', async () => {
    preview.mockResolvedValue({ valid: true, organization_name: 'Acme Corp', role: 'member', email: null });
    setUrl('?invite=good-token');
    render(<LoginScreen onLogin={() => {}} />);
    await screen.findByTestId('invite-valid');
    fillAccount();
    submit();
    await waitFor(() => expect(signup).toHaveBeenCalled());
    expect(signup.mock.calls[0][4]).toEqual({ inviteToken: 'good-token' });
  });

  it('pre-fills the address an email-bound invite was sent to', async () => {
    preview.mockResolvedValue({ valid: true, organization_name: 'Acme Corp', role: 'member', email: 'named@acme.test' });
    setUrl('?invite=good-token');
    render(<LoginScreen onLogin={() => {}} />);
    await screen.findByTestId('invite-valid');
    expect(screen.getByPlaceholderText('Email').value).toBe('named@acme.test');
  });

  it('accepts a code typed by hand', async () => {
    preview.mockResolvedValue({ valid: true, organization_name: 'Acme Corp', role: 'manager', email: null });
    gotoSignup();
    fireEvent.click(screen.getByTestId('have-invite-btn'));
    const field = screen.getByTestId('invite-input');
    fireEvent.change(field, { target: { value: 'typed-token' } });
    fireEvent.blur(field);
    expect(await screen.findByTestId('invite-valid')).toBeTruthy();
    expect(preview).toHaveBeenCalledWith('typed-token');
  });
});

describe('signup — a broken invitation says so and creates nothing', () => {
  const cases = [
    ['expired',  'This invitation has expired. Ask your administrator to send a new one.'],
    ['used',     'This invitation has already been used. If that wasn\'t you, ask your administrator to send a new one.'],
    ['revoked',  'This invitation has been revoked. Ask your administrator to send a new one.'],
    ['unknown',  "This invitation link isn't recognised. Ask your administrator to send a new one."],
  ];

  it.each(cases)('%s — shows the reason', async (_label, reason) => {
    preview.mockResolvedValue({ valid: false, reason });
    setUrl('?invite=bad-token');
    render(<LoginScreen onLogin={() => {}} />);
    const banner = await screen.findByTestId('invite-invalid');
    expect(banner).toHaveTextContent(reason);
  });

  it.each(cases)('%s — does not silently create a new organisation', async (_label, reason) => {
    preview.mockResolvedValue({ valid: false, reason });
    setUrl('?invite=bad-token');
    render(<LoginScreen onLogin={() => {}} />);
    await screen.findByTestId('invite-invalid');
    fillAccount();
    submit();
    expect(await screen.findByTestId('signup-error')).toHaveTextContent(reason);
    expect(signup).not.toHaveBeenCalled();
  });

  it('a wrong-recipient invite names the address it was sent to', async () => {
    preview.mockResolvedValue({
      valid: false,
      reason: 'This invitation was sent to right@acme.test. Sign up with that email address, or ask for an invitation to yours.',
    });
    setUrl('?invite=bound-token');
    render(<LoginScreen onLogin={() => {}} />);
    expect(await screen.findByTestId('invite-invalid')).toHaveTextContent('right@acme.test');
  });

  it('an unverified typed code blocks the submit rather than diverting it', async () => {
    // The field was filled but never checked out — treat it as unusable.
    preview.mockResolvedValue({ valid: false, reason: "This invitation link isn't recognised. Ask your administrator to send a new one." });
    gotoSignup();
    fireEvent.click(screen.getByTestId('have-invite-btn'));
    fireEvent.change(screen.getByTestId('invite-input'), { target: { value: 'garbage' } });
    fillAccount();
    submit();
    expect(await screen.findByTestId('signup-error')).toBeTruthy();
    expect(signup).not.toHaveBeenCalled();
  });

  it('surfaces a server-side rejection at submit time too', async () => {
    // The invite could be revoked between preview and submit.
    preview.mockResolvedValue({ valid: true, organization_name: 'Acme Corp', role: 'member', email: null });
    signup.mockRejectedValue(new Error('This invitation has been revoked. Ask your administrator to send a new one.'));
    setUrl('?invite=good-token');
    render(<LoginScreen onLogin={() => {}} />);
    await screen.findByTestId('invite-valid');
    fillAccount();
    submit();
    expect(await screen.findByTestId('signup-error')).toHaveTextContent(/revoked/i);
  });
});

describe('InviteManager', () => {
  const openAs = (role) => render(
    <InviteManager open onClose={() => {}} lang="en" currentUserRole={role} />
  );

  it('tells a non-admin to ask an admin', async () => {
    openAs('member');
    expect(screen.getByTestId('not-admin')).toBeTruthy();
    expect(listInvites).not.toHaveBeenCalled();
  });

  it('lists existing invitations with their status', async () => {
    listInvites.mockResolvedValue([
      { id: '1', email: 'a@acme.test', role: 'member', expires_at: '2099-01-01T00:00:00Z', accepted_at: null, revoked_at: null },
      { id: '2', email: null, role: 'admin', expires_at: '2020-01-01T00:00:00Z', accepted_at: null, revoked_at: null },
      { id: '3', email: 'c@acme.test', role: 'member', expires_at: '2099-01-01T00:00:00Z', accepted_at: '2026-01-01T00:00:00Z', revoked_at: null },
    ]);
    openAs('admin');
    expect(await screen.findByText('Pending')).toBeTruthy();
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText('Used')).toBeTruthy();
    expect(screen.getByText(/Open link/)).toBeTruthy();
  });

  it('shows the token once, as a shareable link', async () => {
    createInvite.mockResolvedValue({ id: '9', token: 'fresh-token', role: 'member' });
    openAs('admin');
    await screen.findByTestId('no-invites');
    fireEvent.change(screen.getByTestId('invite-email'), { target: { value: 'new@acme.test' } });
    fireEvent.click(screen.getByTestId('create-invite'));
    const link = await screen.findByTestId('invite-link');
    expect(link.value).toContain('?invite=fresh-token');
    expect(createInvite).toHaveBeenCalledWith({ email: 'new@acme.test', role: 'member', expiresInHours: 168 });
  });

  it('reports a failed creation instead of silently doing nothing', async () => {
    createInvite.mockRejectedValue(new Error('Only an organization admin can invite people'));
    openAs('admin');
    await screen.findByTestId('no-invites');
    fireEvent.click(screen.getByTestId('create-invite'));
    expect(await screen.findByTestId('create-error')).toHaveTextContent(/admin/i);
  });

  it('revokes a pending invitation and refreshes', async () => {
    listInvites.mockResolvedValue([
      { id: '1', email: 'a@acme.test', role: 'member', expires_at: '2099-01-01T00:00:00Z', accepted_at: null, revoked_at: null },
    ]);
    openAs('admin');
    fireEvent.click(await screen.findByTestId('revoke-1'));
    await waitFor(() => expect(revokeInvite).toHaveBeenCalledWith('1'));
    expect(listInvites).toHaveBeenCalledTimes(2);
  });

  it('offers no revoke on an invitation already used', async () => {
    listInvites.mockResolvedValue([
      { id: '3', email: 'c@acme.test', role: 'member', expires_at: '2099-01-01T00:00:00Z', accepted_at: '2026-01-01T00:00:00Z', revoked_at: null },
    ]);
    openAs('admin');
    await screen.findByText('Used');
    expect(screen.queryByTestId('revoke-3')).toBeNull();
  });

  it('says plainly that an invitation is the only way in', async () => {
    openAs('admin');
    expect(await screen.findByText(/only way into your organisation/i)).toBeTruthy();
  });
});
