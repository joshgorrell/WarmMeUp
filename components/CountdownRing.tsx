import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

const SIZE = 88;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (remainMins === 0) return `${hrs}h`;
  return `${hrs}h ${remainMins}m`;
}

function getRingColor(fraction: number): { start: string; end: string } {
  if (fraction > 0.25) {
    return { start: '#FFB347', end: '#FF2E8A' };
  }
  if (fraction > 0.083) {
    // last 25% — amber warning
    return { start: '#FF8C00', end: '#FFB347' };
  }
  // last hour — red urgent
  return { start: '#FF3D4F', end: '#FF5A5F' };
}

interface CountdownRingProps {
  expiresAt: string;
  totalSeconds: number;
  onExpire: () => void;
}

export default function CountdownRing({ expiresAt, totalSeconds, onExpire }: CountdownRingProps) {
  const expireMs = new Date(expiresAt).getTime();

  const computeRemaining = () => Math.max(0, Math.round((expireMs - Date.now()) / 1000));

  const [remaining, setRemaining] = useState(computeRemaining);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (remaining <= 0) {
      onExpireRef.current();
      return;
    }
    const id = setInterval(() => {
      const secs = computeRemaining();
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(id);
        onExpireRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const fraction = totalSeconds > 0 ? Math.min(1, Math.max(0, remaining / totalSeconds)) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - fraction);
  const { start, end } = getRingColor(fraction);
  const timeText = formatTimeRemaining(remaining);

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          <SvgGradient id="cdGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={start} />
            <Stop offset="1" stopColor={end} />
          </SvgGradient>
        </Defs>
        {/* Track */}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={STROKE}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke="url(#cdGrad)"
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.textWrap} pointerEvents="none">
        <Text style={[styles.timeText, fraction <= 0.083 && styles.urgent]}>{timeText}</Text>
        <Text style={styles.label}>left</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  textWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  urgent: {
    color: '#FF5A5F',
  },
  label: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 9,
    fontFamily: 'Inter-Medium',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
