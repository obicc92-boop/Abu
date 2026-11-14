/** On Home in a browser: offer to install Abụ, once, until it's installed or dismissed. */
import { useState } from 'react';
import { Text, View } from 'react-native';

import { install, usePwa } from '@/lib/pwa';
import { readSetting, writeSetting } from '@/lib/storage';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { Button, Card, Kicker } from './ui';

const KEY = 'abu.installHint';

export function InstallHint() {
  const styles = useStyles();
  const colors = useColors();
  const pwa = usePwa();
  const [hidden, setHidden] = useState(() => readSetting(KEY) === 'dismissed');
  if (hidden || pwa.installed || (!pwa.canInstall && !pwa.ios)) return null;
  const dismiss = () => {
    writeSetting(KEY, 'dismissed');
    setHidden(true);
  };
  return (
    <Card>
      <Kicker color={colors.redDeep}>Install Abụ</Kicker>
      <Text style={styles.text}>
        {pwa.canInstall
          ? 'Put Abụ on your home screen. It opens like an app and works without data in church.'
          : 'Put Abụ on your home screen: in Safari, tap Share, then “Add to Home Screen”. It works without data in church.'}
      </Text>
      <View style={styles.row}>
        {pwa.canInstall ? <Button small label="Install" onPress={() => void install()} /> : null}
        <Button small kind="ghost" label="Not now" onPress={dismiss} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.ink },
  row: { flexDirection: 'row', gap: 8 },
}));
