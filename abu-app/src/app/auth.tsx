/**
 * Sign up or sign in with email and password. Afterwards, carries on to what
 * the person chose on the welcome screen (join, start a group, just me).
 * Email codes and Google sign-in come later.
 */
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { authClient } from '@/auth/client';
import { Body, Button, Card, Field, Page, TopBar } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme/tokens';

type Next = 'join' | 'create-group' | 'just-me';

export default function Auth() {
  const params = useLocalSearchParams<{ next?: Next; mode?: 'sign-in'; code?: string }>();
  const [mode, setMode] = useState<'sign-up' | 'sign-in'>(params.mode === 'sign-in' ? 'sign-in' : 'sign-up');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { status, setLookingAround } = useSession();
  const [finished, setFinished] = useState(false);

  // Move on only once the app's session knows you're signed in; otherwise the
  // next screen would still see you as signed out and send you back here.
  useEffect(() => {
    if (!finished || status !== 'signedIn') return;
    if (params.next) router.replace({ pathname: `/${params.next}`, params: params.code ? { code: params.code } : {} });
    else router.replace('/');
  }, [finished, status, params.next, params.code]);

  const signingUp = mode === 'sign-up';

  const submit = async () => {
    setError(null);
    if (signingUp && !name.trim()) return setError('Enter your name, as your choir knows you.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter your email address.');
    if (password.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true);
    const result = signingUp
      ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
      : await authClient.signIn.email({ email: email.trim(), password });
    setBusy(false);
    if (result.error) {
      setError(friendlyAuthError(result.error.message, result.error.status, signingUp));
      return;
    }
    setLookingAround(false);
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    setBusy(true);
    setFinished(true);
  };

  return (
    <Page>
      <TopBar back title={signingUp ? 'Create your account' : 'Sign in'} subtitle={intro(params.next)} />
      <Card>
        {signingUp ? <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="e.g. Adaeze Obi" /> : null}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          textContentType={signingUp ? 'newPassword' : 'password'}
          hint={signingUp ? 'At least 8 characters.' : undefined}
          onSubmitEditing={submit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={signingUp ? 'Create account' : 'Sign in'} onPress={submit} busy={busy} />
      </Card>
      <Pressable onPress={() => (setError(null), setMode(signingUp ? 'sign-in' : 'sign-up'))} accessibilityRole="button" style={styles.switch}>
        <Body muted style={{ textAlign: 'center' }}>
          {signingUp ? 'Already have an account? ' : 'New to Abụ? '}
          <Text style={styles.switchStrong}>{signingUp ? 'Sign in' : 'Create an account'}</Text>
        </Body>
      </Pressable>
    </Page>
  );
}

function intro(next?: Next): string {
  if (next === 'join') return 'Then join your group with its code.';
  if (next === 'create-group') return 'Then set up your group and invite members.';
  if (next === 'just-me') return 'Then pick the part you usually sing.';
  return 'Welcome back.';
}

function friendlyAuthError(message: string | undefined, status: number, signingUp: boolean): string {
  const m = (message ?? '').toLowerCase();
  if (signingUp && (m.includes('exist') || status === 422)) return 'There’s already an account with that email. Sign in instead.';
  if (!signingUp && (status === 401 || m.includes('invalid'))) return 'That email and password don’t match. Check them and try again.';
  if (status === 0 || m.includes('fetch')) return 'No connection. Check your data or Wi-Fi and try again.';
  return message || 'Something went wrong. Try again.';
}

const styles = StyleSheet.create({
  error: { fontFamily: fonts.bold, fontSize: 14, color: colors.redDeep },
  switch: { padding: 8 },
  switchStrong: { fontFamily: fonts.heavy, color: colors.red },
});
