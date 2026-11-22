/**
 * Choose a new password, from the link Forgot password emails (/reset-password?token=…; the Worker sends
 * ?error=INVALID_TOKEN instead for a link out of date or used). Saving it signs the account out everywhere, this
 * phone too, so the person signs in with the new one.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { authClient } from '@/auth/client';
import { Body, Button, Card, Field, Page, TopBar } from '@/components/ui';
import { useSession } from '@/state/session';
import { makeStyles } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

export default function ResetPassword() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ token?: string; error?: string }>();
  const { status, signOut } = useSession();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(!params.token || !!params.error);
  const [done, setDone] = useState(false);

  const save = async () => {
    setError(null);
    if (password.length < 8) return setError('Use a password of at least 8 characters.');
    if (again !== password) return setError('The two passwords don’t match.');
    setBusy(true);
    const result = await authClient.resetPassword({ newPassword: password, token: params.token! });
    if (result.error) {
      setBusy(false);
      if (result.error.code === 'INVALID_TOKEN') return setExpired(true);
      if (result.error.status === 0 || (result.error.message ?? '').toLowerCase().includes('fetch'))
        return setError('No connection. Check your data or Wi-Fi and try again.');
      return setError('Something went wrong. Try again.');
    }
    // Every phone signed in as this account has been signed out; this one forgets its saved data as signing out does.
    if (status === 'signedIn') await signOut();
    setBusy(false);
    setDone(true);
  };

  const signIn = () => router.replace({ pathname: '/auth', params: { mode: 'sign-in' } });

  if (done) {
    return (
      <Page>
        <TopBar title="New password saved" />
        <Card>
          <Body>Sign in with your new password. Any phone that was signed in as you has been signed out.</Body>
          <Button label="Sign in" onPress={signIn} />
        </Card>
      </Page>
    );
  }

  if (expired) {
    return (
      <Page>
        <TopBar back title="This link has run out" />
        <Card>
          <Body>A link to choose a new password works for one hour, and only once. Ask for a new one.</Body>
          <Button label="Send me a new link" onPress={() => router.replace('/forgot-password')} />
          <Button kind="ghost" label="Back to sign in" onPress={signIn} />
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <TopBar back title="Choose a new password" />
      <Card>
        <Field
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          hint="At least 8 characters."
        />
        <Field
          label="New password again"
          value={again}
          onChangeText={setAgain}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={save}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Save the new password" onPress={save} busy={busy} />
      </Card>
    </Page>
  );
}

const useStyles = makeStyles((colors) => ({
  error: { fontFamily: fonts.bold, fontSize: 14, color: colors.danger },
}));
