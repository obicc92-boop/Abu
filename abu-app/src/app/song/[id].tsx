/** A song's page: the player (or its sheet), its actions and your practice. */
import { useLocalSearchParams } from 'expo-router';

import { SongView } from '@/components/song-view';

export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SongView id={id} />;
}
