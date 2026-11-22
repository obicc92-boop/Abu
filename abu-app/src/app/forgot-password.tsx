/**
 * Forgot password: SolfaScores emails a link to choose a new one (abu-api/src/auth.ts), which opens
 * /reset-password. It says the same whether or not there's an account with the email, as the Worker does.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { authClient } from '@/auth/client';
import { Body, Button, Card, Field, Page, TopBar } from '@/components/ui';
import { makeStyles } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

export default function ForgotPassword() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setError(null);
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError('Enter the email you signed up with.');
    setBusy(true);
    const result = await authClient.requestPasswordReset({ email: address, redirectTo: '/reset-password' });
    setBusy(false);
    if (result.error) return setError(sendError(result.error.status, result.error.message));
    setSentTo(address);
  };

  const signIn = () => router.replace({ pathname: '/auth', params: { mode: 'sign-in' } });

  if (sentTo) {
    return (
      <Page>
        <TopBar back title="Check your email" />
        <Card>
          <Body>
            If there’s a SolfaScores account for <Text style={styles.strong}>{sentTo}</Text>, we’ve sent it a link to choose a new password. The
            link works for one hour.
          </Body>
          <Body muted>Can’t see it? Wait a minute, and look in Spam or Promotions.</Body>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Back to sign in" onPress={signIn} />
          <Button kind="ghost" label="Send it again" onPress={send} busy={busy} />
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <TopBar back title="Forgot your password?" subtitle="We’ll email you a link to choose a new one." />
      <Card>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="you@example.com"
          onSubmitEditing={send}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Send me a link" onPress={send} busy={busy} />
      </Card>
    </Page>
  );
}

function sendError(status: number, message?: string): string {
  if (status === 429) return 'Too many tries. Wait a minute and try again.';
  if (status === 0 || (message ?? '').toLowerCase().includes('fetch')) return 'No connection. Check your data or Wi-Fi and try again.';
  return 'Something went wrong. Try again.';
}

const useStyles = makeStyles((colors) => ({
  error: { fontFamily: fonts.bold, fontSize: 14, color: colors.danger },
  strong: { fontFamily: fonts.bold, color: colors.ink },
}));
