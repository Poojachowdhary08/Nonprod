import React, { useState } from 'react';
import { Platform, View, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import EmojiSelector, { Categories } from 'react-native-emoji-selector';
import TText from "@/components/TText";
import { useFontScale } from "@/context/FontScaleContext";

interface Props {
  onSelect: (emoji: string) => void;
  showFullPicker?: boolean; // if true, show full selector
}

const DEFAULT_EMOJIS = ['👍', '👎', '✅', '❌', '😮', '🙏'];

const EmojiPicker: React.FC<Props> = ({ onSelect, showFullPicker = false }) => {
  const [slideAnim] = useState(new Animated.Value(0));

  const animateIn = () => {
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const animateOut = (callback: () => void) => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => callback());
  };

  React.useEffect(() => {
    animateIn();
  }, []);

  // ✅ Web Full Picker
  if (Platform.OS === 'web' && showFullPicker) {
    const Picker = require('emoji-picker-react').default;

    return (
      <div style={{ height: 300, overflowY: 'scroll', backgroundColor: '#fff', borderTop: '1px solid #ccc' }}>
        <Picker
          onEmojiClick={(emojiData: any) => {
            const emoji = emojiData?.emoji;
            if (emoji) onSelect(emoji);
          }}
          width="100%"
        />
      </div>
    );
  }

  // ✅ Android/iOS Full Picker
  if (Platform.OS !== 'web' && showFullPicker) {
    return (
      <View style={{ height: 300 }}>
        <EmojiSelector
          category={Categories.all}
          onEmojiSelected={(emoji: string) => onSelect(emoji)}
          showSearchBar={false}
          showTabs={true}
          showHistory={true}
          columns={8}
        />
      </View>
    );
  }

  // ✅ Minimal Popup Bar (All platforms)
  return (
    <Animated.View style={[styles.bar, { transform: [{ translateY: slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [60, 0],
      }) }] }]} testID="emoji-picker-root">
      {DEFAULT_EMOJIS.map((emoji) => (
        <TouchableOpacity key={emoji} onPress={() => onSelect(emoji)} style={styles.emojiButton}>
          <TText style={styles.emoji}>{emoji}</TText>
        </TouchableOpacity>
      ))}
      {/* ➕ for full picker */}
      <TouchableOpacity
        onPress={() => {
          animateOut(() => onSelect('PICKER'));
        }}
        style={styles.emojiButton}
      >
        <TText style={[styles.emoji, { fontSize: 22 }]}>➕</TText>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#ccc',
    justifyContent: 'space-evenly',
  },
  emojiButton: {
    paddingHorizontal: 6,
  },
  emoji: {
    fontSize: 20,
  },
});

export default EmojiPicker;