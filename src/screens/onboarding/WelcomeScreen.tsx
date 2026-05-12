import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, Pressable, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { fadeIn, fadeInUp } from '@/constants/entering';
import { color, text, inter, space, radius, font, motion, createStyles } from '@/constants/theme';
import { useColorSchemePreference, type ColorSchemePreference } from '@/constants/color-scheme';
import { AppModal } from '@/components/ui/AppModal';
import { loadServiceEndpoints, saveServiceEndpoints } from '@/services/storage';
import { DEFAULT_SERVICE_ENDPOINTS } from '@/models/types';
import type { ServiceEndpoints } from '@/models/types';
import { Settings, X, RefreshCw, Sun, Moon, Monitor } from 'lucide-react-native';
import { hapticLight } from '@/services/platform';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ---------------------------------------------------------------------------
// Service endpoint health check (same logic as SettingsScreen)
// ---------------------------------------------------------------------------

type ServiceHealth = {
  status: 'checking' | 'ok' | 'not_https' | 'unreachable' | 'invalid_response';
  latencyMs?: number;
  detail?: string;
};

const SERVICE_IDENTITY: Record<string, string> = {
  data: 'ethereum-data',
  passkey: 'webauthn-p256-publickey-index',
  bundler: 'vela-bundler',
};

async function checkServiceEndpointHealth(
  url: string, type: 'data' | 'passkey' | 'bundler',
): Promise<ServiceHealth> {
  if (!url) return { status: 'unreachable', detail: 'Empty URL' };
  if (!url.startsWith('https://')) return { status: 'not_https', detail: 'HTTPS required' };

  const base = url.trim().replace(/[\r\n]/g, '').replace(/\/$/, '');
  const expected = SERVICE_IDENTITY[type];
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${base}/api/health?_t=${start}`, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    if (!res.ok) return { status: 'unreachable', latencyMs, detail: `HTTP ${res.status}` };
    const json = JSON.parse(await res.text());
    if (json.service !== expected || json.status !== 'ok') {
      return { status: 'invalid_response', latencyMs, detail: `Not a valid ${expected} service` };
    }
    return { status: 'ok', latencyMs };
  } catch {
    clearTimeout(timeout);
    return { status: 'unreachable', detail: 'Connection failed' };
  }
}

function HealthDot({ health }: { health: ServiceHealth }) {
  if (health.status === 'checking') {
    return <ActivityIndicator size={8} color="rgba(255,255,255,0.4)" style={{ marginLeft: 6 }} />;
  }
  const isOk = health.status === 'ok';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isOk ? '#4CAF50' : '#E8572A' }} />
      <Text style={{ fontSize: 11, fontWeight: '500', color: isOk ? '#4CAF50' : '#E8572A' }}>
        {isOk ? `${health.latencyMs}ms` : (health.detail ?? 'Offline')}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Onboarding Settings Modal
// ---------------------------------------------------------------------------

const THEME_OPTIONS: { key: ColorSchemePreference; label: string; Icon: React.ComponentType<any> }[] = [
  { key: 'light', label: 'Light', Icon: Sun },
  { key: 'dark', label: 'Dark', Icon: Moon },
  { key: 'auto', label: 'Auto', Icon: Monitor },
];

function OnboardingSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [endpoints, setEndpoints] = useState<ServiceEndpoints>({ ...DEFAULT_SERVICE_ENDPOINTS });
  const [healths, setHealths] = useState<Record<string, ServiceHealth>>({});
  const [refreshCount, setRefreshCount] = useState(0);
  const { preference: colorPref, setPreference: setColorPref } = useColorSchemePreference();

  useEffect(() => { if (visible) loadServiceEndpoints().then(setEndpoints); }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const keys = ['ethereumDataURL', 'passkeyIndexURL', 'bundlerServiceURL'] as const;
    const types = ['data', 'passkey', 'bundler'] as const;
    setHealths(Object.fromEntries(keys.map(k => [k, { status: 'checking' as const }])));
    keys.forEach((key, i) => {
      checkServiceEndpointHealth(endpoints[key], types[i]).then(h => {
        setHealths(prev => ({ ...prev, [key]: h }));
      });
    });
  }, [visible, refreshCount]);

  const handleSave = useCallback(async (field: keyof ServiceEndpoints, value: string) => {
    const clean = value.trim().replace(/[\r\n]/g, '');
    const updated = { ...endpoints, [field]: clean };
    setEndpoints(updated);
    await saveServiceEndpoints(updated);
    setRefreshCount(c => c + 1);
  }, [endpoints]);

  const fields: { key: keyof ServiceEndpoints; label: string }[] = [
    { key: 'ethereumDataURL', label: 'Chain Data Index' },
    { key: 'passkeyIndexURL', label: 'Passkey Index' },
    { key: 'bundlerServiceURL', label: 'Bundler Service' },
  ];

  return (
    <AppModal visible={visible} onClose={onClose}>
      <View style={settingsStyles.container}>
        <View style={settingsStyles.header}>
          <Text style={settingsStyles.title}>Settings</Text>
          <View style={settingsStyles.headerRight}>
            <Pressable onPress={() => setRefreshCount(c => c + 1)} hitSlop={8} style={settingsStyles.headerBtn}>
              <RefreshCw size={18} color={color.fg.muted} strokeWidth={2} />
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={22} color={color.fg.base} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
        <ScrollView style={settingsStyles.scroll} contentContainerStyle={settingsStyles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Theme */}
          <Text style={settingsStyles.sectionLabel}>APPEARANCE</Text>
          <View style={settingsStyles.themeRow}>
            {THEME_OPTIONS.map(({ key, label, Icon }) => {
              const active = colorPref === key;
              return (
                <Pressable key={key} style={[settingsStyles.themeOption, active && settingsStyles.themeOptionActive]}
                  onPress={() => { if (key !== colorPref) { hapticLight(); setColorPref(key); } }}>
                  <Icon size={16} color={active ? color.accent.base : color.fg.subtle} strokeWidth={2} />
                  <Text style={[settingsStyles.themeLabel, active && settingsStyles.themeLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Service Endpoints */}
          <Text style={settingsStyles.sectionLabel}>SERVICE ENDPOINTS</Text>
          <Text style={settingsStyles.hint}>
            If the default services are unreachable in your region, configure your own endpoints here.
          </Text>
          {fields.map(({ key, label }) => (
            <View key={key} style={settingsStyles.field}>
              <View style={settingsStyles.fieldHeader}>
                <Text style={settingsStyles.fieldLabel}>{label}</Text>
                <HealthDot health={healths[key] ?? { status: 'checking' }} />
              </View>
              <TextInput
                style={settingsStyles.input}
                value={endpoints[key]}
                onChangeText={(v) => setEndpoints({ ...endpoints, [key]: v })}
                onBlur={() => handleSave(key, endpoints[key])}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={DEFAULT_SERVICE_ENDPOINTS[key]}
                placeholderTextColor={color.fg.subtle}
              />
            </View>
          ))}
          <Pressable style={settingsStyles.resetBtn} onPress={() => {
            setEndpoints({ ...DEFAULT_SERVICE_ENDPOINTS });
            saveServiceEndpoints({ ...DEFAULT_SERVICE_ENDPOINTS });
            setRefreshCount(c => c + 1);
          }}>
            <Text style={settingsStyles.resetText}>Reset to Defaults</Text>
          </Pressable>
        </ScrollView>
      </View>
    </AppModal>
  );
}

const settingsStyles = createStyles(() => ({
  container: { flex: 1, backgroundColor: color.bg.base },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space['3xl'], paddingVertical: space.xl, borderBottomWidth: 1, borderBottomColor: color.border.base },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  headerBtn: { padding: space.sm },
  title: { fontSize: text.xl, ...inter.bold, color: color.fg.base },
  scroll: { flex: 1 },
  scrollContent: { padding: space['3xl'], paddingBottom: space['5xl'] },
  sectionLabel: { fontSize: text.xs, ...inter.semibold, color: color.fg.subtle, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: space.lg, marginTop: space.xl },
  hint: { fontSize: text.sm, ...inter.regular, color: color.fg.muted, lineHeight: 20, marginBottom: space.xl },
  themeRow: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  themeOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.lg, borderRadius: radius.lg, backgroundColor: color.bg.sunken },
  themeOptionActive: { backgroundColor: color.accent.soft, borderWidth: 1.5, borderColor: color.accent.base },
  themeLabel: { fontSize: text.sm, ...inter.medium, color: color.fg.subtle },
  themeLabelActive: { color: color.accent.base, ...inter.semibold },
  field: { marginBottom: space.xl },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
  fieldLabel: { fontSize: text.sm, ...inter.semibold, color: color.fg.base },
  input: { fontSize: text.sm, fontWeight: '500', fontFamily: font.mono, color: color.fg.base, padding: space.lg, backgroundColor: color.bg.sunken, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border.base },
  resetBtn: { alignItems: 'center', paddingVertical: space.xl, marginTop: space.sm },
  resetText: { fontSize: text.base, ...inter.semibold, color: color.accent.base },
}));

// ---------------------------------------------------------------------------
// Welcome Screen
// ---------------------------------------------------------------------------

interface Props {
  onCreateWallet: () => void;
  onLogin: () => void;
  loginLoading?: boolean;
}

function AnimatedButton({
  onPress,
  style,
  children,
  disabled,
}: {
  onPress: () => void;
  style: any;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.97, motion.spring); }}
      onPressOut={() => { scale.value = withSpring(1, motion.spring); }}
      disabled={disabled}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function WelcomeScreen({ onCreateWallet, onLogin, loginLoading }: Props) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Settings gear — top right */}
        <Animated.View style={styles.settingsRow} entering={fadeIn(400, 600)}>
          <Pressable onPress={() => setShowSettings(true)} hitSlop={12} style={styles.settingsBtn}>
            <Settings size={20} color="rgba(255,255,255,0.35)" strokeWidth={2} />
          </Pressable>
        </Animated.View>

        <View style={styles.logoSection}>
          <Animated.View entering={fadeIn(200, 600)}>
            <Text style={styles.logo}>
              vel<Text style={styles.logoAccent}>a</Text>
            </Text>
          </Animated.View>
          <Animated.View entering={fadeIn(500, 600)}>
            <Text style={styles.tagline}>
              Your keys, your coins.{'\n'}Simple as a tap.
            </Text>
          </Animated.View>
        </View>

        <Animated.View style={styles.buttonSection} entering={fadeInUp(700, 500)}>
          <AnimatedButton onPress={onCreateWallet} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Create Wallet</Text>
          </AnimatedButton>

          <AnimatedButton
            onPress={onLogin}
            style={styles.secondaryBtn}
            disabled={loginLoading}
          >
            {loginLoading ? (
              <ActivityIndicator color="rgba(255,255,255,0.5)" />
            ) : (
              <Text style={styles.secondaryBtnText}>I already have a wallet</Text>
            )}
          </AnimatedButton>
        </Animated.View>
      </SafeAreaView>

      <OnboardingSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: '#1A1A18', // Always dark — brand identity screen
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: space['3xl'],
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: space.md,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    ...inter.bold,
    color: '#FFFFFF', // Always white on dark brand screen
    letterSpacing: 3,
  },
  logoAccent: {
    color: '#E8572A', // Hardcoded accent for brand screen
  },
  tagline: {
    fontSize: text.lg,
    ...inter.regular,
    color: 'rgba(255,255,255,0.45)',
    marginTop: space.xl,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonSection: {
    paddingBottom: space['3xl'],
    gap: space.lg,
  },
  primaryBtn: {
    paddingVertical: space['2xl'],
    borderRadius: radius.xl,
    backgroundColor: '#E8572A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: text.lg,
    ...inter.bold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    paddingVertical: space['2xl'],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: text.lg,
    ...inter.semibold,
    color: 'rgba(255,255,255,0.5)',
  },
}));
