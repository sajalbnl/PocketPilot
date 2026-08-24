import { dataModes } from '@pocketpilot/shared';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function FoundationScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>QUESTFLOW PROOF OF WORK</Text>
        <Text style={styles.title}>pocketpilot</Text>
        <Text style={styles.subtitle}>Finance-agent control, built around explicit approval.</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phase 1 foundation ready</Text>
          <Text style={styles.cardBody}>
            Shared contracts, deterministic signal states, and the API persistence layer are wired
            for the product loop in Phase 2.
          </Text>
          <Text style={styles.mode}>Default data mode · {dataModes[0].toUpperCase()}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08110E',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  eyebrow: {
    color: '#72E6B1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  title: {
    color: '#F5FFF9',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  subtitle: {
    color: '#A7B8B0',
    fontSize: 17,
    lineHeight: 25,
    marginTop: 8,
    maxWidth: 340,
  },
  card: {
    backgroundColor: '#10211B',
    borderColor: '#244437',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 36,
    padding: 20,
  },
  cardTitle: {
    color: '#F5FFF9',
    fontSize: 18,
    fontWeight: '700',
  },
  cardBody: {
    color: '#B9C9C1',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  mode: {
    color: '#72E6B1',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 18,
  },
});
