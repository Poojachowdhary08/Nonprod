import { updateGlobalContext } from "../utils/telemetry";
import React, { useMemo, useRef, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Alert,
  BackHandler,
  StatusBar,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PhoneInput from "react-native-phone-input";
import { useRouter } from "expo-router";
import "react-native-get-random-values";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";

import { API_BASE_URL } from "../utils/apiBase";
import { persistAuthSession } from "../utils/auth";
import { registerPrelogin } from "../utils/registerPrelogin";
import { getOrCreateDeviceId } from "../utils/deviceId";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";

const LoginPage = () => {
  const { theme } = useTheme();
  const router = useRouter();
  const C = useMemo(
    () => ({
      mode: theme.mode,
      bg: theme.colors.bgElevated,
      top: theme.colors.bg,
      card: theme.colors.surface,
      accent: theme.colors.primaryStrong,
      accentDark: theme.colors.primary,
      accentSoft: theme.colors.primarySoft,
      text: theme.colors.text,
      muted: theme.colors.mutedText,
      placeholder: theme.colors.subtleText,
      border: theme.colors.borderStrong,
      inputBg: theme.colors.inputBg,
      inputFocusBg: theme.colors.inputFocusBg,
      activeTabBg:
        theme.mode === "dark" ? theme.colors.surfaceAlt : theme.colors.white,
      activeTabText:
        theme.mode === "dark" ? theme.colors.white : theme.colors.text,
      error: theme.colors.danger,
      line: theme.colors.border,
      white: theme.colors.white,
      pill: theme.colors.pill,
    }),
    [theme]
  );
  const styles = useMemo(() => createStyles(C), [C]);

  const [verificationCode, setVerificationCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [requestedPhoneNumber, setRequestedPhoneNumber] = useState("");
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");

  const [isResetMode, setIsResetMode] = useState(false);
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetPhoneNumber, setResetPhoneNumber] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showConfirmResetPassword, setShowConfirmResetPassword] = useState(false);
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  const [errors, setErrors] = useState({
    phoneNumber: "",
    verificationCode: "",
    password: "",
    resetOtp: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [activeInput, setActiveInput] = useState<string | null>(null);
  const otpPhoneInputRef = useRef<PhoneInput | null>(null);
  const passwordPhoneInputRef = useRef<PhoneInput | null>(null);

  const setPhoneInputValue = (
    ref: React.MutableRefObject<PhoneInput | null>,
    value: string
  ) => {
    const instance = ref.current as unknown as { setValue?: (next: string) => void } | null;
    instance?.setValue?.(value);
  };

  const isOnline = async (): Promise<boolean> => {
    const state = await NetInfo.fetch();
    return !!(state.isConnected && state.isInternetReachable !== false);
  };

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => true;
      BackHandler.addEventListener("hardwareBackPress", onBackPress);

      (async () => {
        const online = await isOnline();
        const loginType = await AsyncStorage.getItem("login_type");
        const refresh = await AsyncStorage.getItem("refresh_token");
        if (!online && (loginType || refresh)) {
          router.replace("/HomeScreen");
        }
      })();

      return () => BackHandler.removeEventListener("hardwareBackPress", onBackPress);
    }, [router])
  );

  const clearErrors = () => {
    setErrors({
      phoneNumber: "",
      verificationCode: "",
      password: "",
      resetOtp: "",
      newPassword: "",
      confirmPassword: "",
    });
  };

  const resetOtpModeState = () => {
    setOtpSent(false);
    setRequestedPhoneNumber("");
    setVerificationCode("");
    setPassword("");
    clearErrors();
  };

  const resetForgotPasswordState = (options?: { preservePhone?: string }) => {
    const preservedPhone = options?.preservePhone || "";
    setIsResetMode(false);
    setResetOtpSent(false);
    setResetPhoneNumber(preservedPhone);
    setResetOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setShowResetPassword(false);
    setShowConfirmResetPassword(false);
    setIsSubmittingReset(false);
    clearErrors();
    if (preservedPhone) {
      setPhoneInputValue(passwordPhoneInputRef, preservedPhone);
    }
  };

  const resetPasswordModeState = () => {
    setPassword("");
    resetForgotPasswordState();
  };

  const getValidatedPhoneNumber = (ref: React.MutableRefObject<PhoneInput | null>) => {
    if (!ref.current?.isValidNumber()) {
      setErrors((prev) => ({
        ...prev,
        phoneNumber: "Please enter a valid phone number.",
      }));
      return null;
    }

    return ref.current.getValue();
  };

  const requestOtpForPhone = async (fullPhoneNumber: string) => {
    const deviceId = await registerPrelogin(API_BASE_URL, fullPhoneNumber);

    const response = await fetch(`${API_BASE_URL}/auth/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone_number: fullPhoneNumber,
        device_id: deviceId,
        platform: "mobile",
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to send OTP.");

    return fullPhoneNumber;
  };

  const requestPasswordResetOtp = async (fullPhoneNumber: string) => {
    const deviceId = await registerPrelogin(API_BASE_URL, fullPhoneNumber);

    const response = await fetch(`${API_BASE_URL}/auth/password/forgot/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone_number: fullPhoneNumber,
        device_id: deviceId,
        platform: "mobile",
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Failed to send password reset OTP.");
    }

    return {
      deviceId,
      message:
        data.message || "If your account exists, a password reset OTP has been sent.",
    };
  };

  const handleSendOtp = async () => {
    clearErrors();

    const fullPhoneNumber = getValidatedPhoneNumber(otpPhoneInputRef);
    if (!fullPhoneNumber) return;

    if (!(await isOnline())) {
      Alert.alert("Offline", "You're offline. Please reconnect to send OTP.");
      return;
    }

    try {
      await requestOtpForPhone(fullPhoneNumber);
      setRequestedPhoneNumber(fullPhoneNumber);
      setOtpSent(true);
      Alert.alert("OTP Sent", `OTP has been sent to: ${fullPhoneNumber}`);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to send OTP.");
    }
  };

  const handleVerifyOtp = async () => {
    clearErrors();

    const fullPhoneNumber =
      requestedPhoneNumber || getValidatedPhoneNumber(otpPhoneInputRef);
    if (!fullPhoneNumber) return;

    if (!verificationCode.trim()) {
      setErrors((prev) => ({
        ...prev,
        verificationCode: "Please enter the OTP code.",
      }));
      return;
    }

    if (!(await isOnline())) {
      Alert.alert("Offline", "You're offline. Please reconnect to verify OTP.");
      return;
    }

    try {
      const deviceId = await getOrCreateDeviceId();

      const response = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: fullPhoneNumber,
          otp: verificationCode,
          device_id: deviceId,
          platform: "mobile",
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Invalid OTP.");

      await persistAuthSession(data, {
        loginType: "phone",
        deviceId,
      });

      const employeeCode = data?.user?.employee_code || null;
      updateGlobalContext({ userId: employeeCode || fullPhoneNumber, employeeCode });
      router.replace("/RedirectAfterLogin");
    } catch (error: any) {
      setErrors((prev) => ({
        ...prev,
        verificationCode: error.message || "Invalid OTP.",
      }));
    }
  };

  const handleResendOtp = async () => {
    clearErrors();

    if (!requestedPhoneNumber) {
      setOtpSent(false);
      return;
    }

    if (!(await isOnline())) {
      Alert.alert("Offline", "You're offline. Please reconnect to resend OTP.");
      return;
    }

    try {
      await requestOtpForPhone(requestedPhoneNumber);
      setVerificationCode("");
      Alert.alert("OTP Sent", `A new OTP has been sent to: ${requestedPhoneNumber}`);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to resend OTP.");
    }
  };

  const handleChangeOtpNumber = () => {
    setOtpSent(false);
    setRequestedPhoneNumber("");
    setVerificationCode("");
    clearErrors();
  };

  const handlePasswordLogin = async () => {
    clearErrors();

    const fullPhoneNumber = getValidatedPhoneNumber(passwordPhoneInputRef);
    if (!fullPhoneNumber) return;

    if (!password.trim()) {
      setErrors((prev) => ({
        ...prev,
        password: "Password cannot be empty.",
      }));
      return;
    }

    if (!(await isOnline())) {
      Alert.alert("Offline", "You're offline. Please reconnect to login.");
      return;
    }

    try {
      const deviceId = await registerPrelogin(API_BASE_URL, fullPhoneNumber);

      const response = await fetch(`${API_BASE_URL}/auth/login/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: fullPhoneNumber,
          password,
          device_id: deviceId,
          platform: "mobile",
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Login failed.");

      await persistAuthSession(data, {
        loginType: "password",
        deviceId,
      });

      const employeeCode = data?.user?.employee_code || null;
      updateGlobalContext({ userId: employeeCode || fullPhoneNumber, employeeCode });
      router.replace("/RedirectAfterLogin");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Login failed.");
    }
  };

  const handleForgotPassword = async () => {
    clearErrors();

    const phone = getValidatedPhoneNumber(passwordPhoneInputRef);
    if (!phone) return;

    if (!(await isOnline())) {
      Alert.alert("Offline", "Please reconnect first.");
      return;
    }

    try {
      setIsSubmittingReset(true);
      const result = await requestPasswordResetOtp(phone);
      setIsResetMode(true);
      setResetOtpSent(true);
      setResetPhoneNumber(phone);
      setResetOtp("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("OTP Sent", result.message);
    } catch (err: any) {
      Alert.alert("Failed", err.message || "Could not start password reset.");
    } finally {
      setIsSubmittingReset(false);
    }
  };

  const handleResendResetOtp = async () => {
    clearErrors();

    if (!resetPhoneNumber) {
      setIsResetMode(false);
      setResetOtpSent(false);
      return;
    }

    if (!(await isOnline())) {
      Alert.alert("Offline", "Please reconnect first.");
      return;
    }

    try {
      setIsSubmittingReset(true);
      const result = await requestPasswordResetOtp(resetPhoneNumber);
      setResetOtp("");
      Alert.alert("OTP Sent", result.message);
    } catch (err: any) {
      Alert.alert("Failed", err.message || "Could not resend password reset OTP.");
    } finally {
      setIsSubmittingReset(false);
    }
  };

  const handleSubmitResetPassword = async () => {
    clearErrors();

    if (!resetPhoneNumber) {
      setErrors((prev) => ({
        ...prev,
        phoneNumber: "Please restart the forgot password flow.",
      }));
      return;
    }

    if (!resetOtp.trim()) {
      setErrors((prev) => ({
        ...prev,
        resetOtp: "Please enter the OTP code.",
      }));
      return;
    }

    if (!newPassword.trim()) {
      setErrors((prev) => ({
        ...prev,
        newPassword: "Please enter a new password.",
      }));
      return;
    }

    if (newPassword.trim().length < 8) {
      setErrors((prev) => ({
        ...prev,
        newPassword: "Password must be at least 8 characters.",
      }));
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrors((prev) => ({
        ...prev,
        confirmPassword: "Passwords do not match.",
      }));
      return;
    }

    if (!(await isOnline())) {
      Alert.alert("Offline", "Please reconnect first.");
      return;
    }

    try {
      setIsSubmittingReset(true);
      const deviceId = await getOrCreateDeviceId();
      const response = await fetch(`${API_BASE_URL}/auth/password/forgot/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: resetPhoneNumber,
          otp: resetOtp.trim(),
          new_password: newPassword,
          device_id: deviceId,
          platform: "mobile",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Could not reset password.");
      }

      setShowPasswordLogin(true);
      resetPasswordModeState();
      setResetPhoneNumber(resetPhoneNumber);
      setPhoneInputValue(passwordPhoneInputRef, resetPhoneNumber);
      Alert.alert(
        "Password Reset",
        data.message || "Password reset successful. Please sign in with your new password."
      );
    } catch (err: any) {
      const message = err.message || "Could not reset password.";
      if (/otp/i.test(message)) {
        setErrors((prev) => ({ ...prev, resetOtp: message }));
      } else if (/password/i.test(message)) {
        setErrors((prev) => ({ ...prev, newPassword: message }));
      } else {
        Alert.alert("Failed", message);
      }
    } finally {
      setIsSubmittingReset(false);
    }
  };

  const currentMode = showPasswordLogin ? "password" : "otp";
  const modeTitle =
    currentMode === "otp" ? "Sign in with OTP" : "Sign in with Password";
  const modeSubtitle =
    currentMode === "otp"
      ? "We'll send a one-time code to your mobile number."
      : isResetMode
        ? "Reset your password with an OTP sent to your registered mobile number."
        : "Use your registered phone number and password to continue.";

  const inputStyle = (field: string) => [
    styles.input,
    activeInput === field && styles.inputFocused,
  ];

  return (
    <>
      <StatusBar
        barStyle={theme.mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={C.top}
      />
      <ScrollView
        testID="login-page-root"
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View testID="login-top-section" style={styles.topSection}>
          <View testID="login-logo-badge" style={styles.logoBadge}>
            <Image
              testID="login-logo"
              source={require("../assets/images/cropped-Avenue-reality-logo.webp")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        </View>

        <View testID="login-card" style={styles.card}>
          <View style={styles.headingBlock}>
            <TText testID="login-heading" style={styles.heading}>
              {modeTitle}
            </TText>
            <TText style={styles.subheading}>{modeSubtitle}</TText>
          </View>

          <View testID="login-segment-control" style={styles.segControl}>
            <TouchableOpacity
              testID="otp-login-tab"
              style={[styles.segBtn, currentMode === "otp" && styles.segBtnActive]}
              activeOpacity={0.9}
              onPress={() => {
                setShowPasswordLogin(false);
                resetOtpModeState();
              }}
            >
              <View style={styles.segBtnInner}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={15}
                  color={currentMode === "otp" ? C.activeTabText : C.muted}
                />
                <TText
                  testID="otp-login-tab-text"
                  style={[styles.segBtnText, currentMode === "otp" && styles.segBtnTextActive]}
                >
                  OTP Login
                </TText>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              testID="password-login-tab"
              style={[styles.segBtn, currentMode === "password" && styles.segBtnActive]}
              activeOpacity={0.9}
              onPress={() => {
                setShowPasswordLogin(true);
                resetPasswordModeState();
              }}
            >
              <View style={styles.segBtnInner}>
                <Ionicons
                  name="lock-closed-outline"
                  size={15}
                  color={currentMode === "password" ? C.activeTabText : C.muted}
                />
                <TText
                  testID="password-login-tab-text"
                  style={[
                    styles.segBtnText,
                    currentMode === "password" && styles.segBtnTextActive,
                  ]}
                >
                  Password
                </TText>
              </View>
            </TouchableOpacity>
          </View>

          {currentMode === "otp" && (
            <View testID="otp-login-form" style={styles.form}>
              {!otpSent ? (
                <>
                  <TText testID="otp-phone-label" style={styles.fieldLabel}>
                    Mobile Number
                  </TText>
                  <View
                    testID="otp-phone-wrapper"
                    style={[styles.phoneWrapper, activeInput === "phone" && styles.inputFocused]}
                  >
                    <Ionicons
                      name="call-outline"
                      size={18}
                      color={activeInput === "phone" ? C.accent : C.muted}
                      style={styles.inputIcon}
                    />
                    <PhoneInput
                      ref={otpPhoneInputRef}
                      style={styles.phoneInput}
                      initialCountry="in"
                      textProps={{
                        testID: "otp-phone-input",
                        placeholder: "Enter phone number",
                        placeholderTextColor: C.placeholder,
                        style: { color: C.text, fontSize: 15, flex: 1 },
                        onFocus: () => setActiveInput("phone"),
                        onBlur: () => setActiveInput(null),
                      }}
                    />
                  </View>
                  {errors.phoneNumber ? (
                    <TText testID="otp-phone-error" style={styles.errorText}>
                      {errors.phoneNumber}
                    </TText>
                  ) : null}

                  <TouchableOpacity
                    testID="send-otp-button"
                    style={styles.primaryBtn}
                    activeOpacity={0.92}
                    onPress={handleSendOtp}
                  >
                    <TText testID="send-otp-button-text" style={styles.primaryBtnText}>
                      Continue
                    </TText>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View testID="otp-locked-phone-block" style={styles.lockedPhoneBlock}>
                    <View style={styles.lockedPhoneHeader}>
                      <View style={styles.lockedPhoneInfoRow}>
                        <View style={styles.lockedPhoneIconBadge}>
                          <Ionicons name="shield-checkmark-outline" size={18} color={C.accentDark} />
                        </View>
                        <View style={styles.lockedPhoneTextWrap}>
                          <TText testID="otp-locked-phone-title" style={styles.lockedPhoneTitle}>
                            Verify details
                          </TText>
                          <TText testID="otp-locked-phone-subtitle" style={styles.lockedPhoneSubtitle}>
                            OTP sent to {requestedPhoneNumber}
                          </TText>
                        </View>
                      </View>

                      <TouchableOpacity
                        testID="change-otp-number-button"
                        style={styles.changeNumberBtn}
                        onPress={handleChangeOtpNumber}
                      >
                        <Ionicons name="create-outline" size={14} color={C.accentDark} />
                        <TText style={styles.changeNumberBtnText}>Change</TText>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <TText testID="otp-code-label" style={styles.fieldLabel}>
                    OTP Code
                  </TText>
                  <TextInput
                    testID="otp-code-input"
                    placeholder="Enter 6-digit OTP"
                    placeholderTextColor={C.placeholder}
                    style={inputStyle("otp")}
                    keyboardType="numeric"
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                    onFocus={() => setActiveInput("otp")}
                    onBlur={() => setActiveInput(null)}
                  />
                  {errors.verificationCode ? (
                    <TText testID="otp-code-error" style={styles.errorText}>
                      {errors.verificationCode}
                    </TText>
                  ) : null}

                  <TouchableOpacity
                    testID="verify-otp-button"
                    style={styles.primaryBtn}
                    activeOpacity={0.92}
                    onPress={handleVerifyOtp}
                  >
                    <TText testID="verify-otp-button-text" style={styles.primaryBtnText}>
                      Verify & Continue
                    </TText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="resend-otp-button"
                    style={styles.linkBtn}
                    onPress={handleResendOtp}
                  >
                    <TText testID="resend-otp-button-text" style={styles.linkBtnText}>
                      Resend OTP
                    </TText>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {currentMode === "password" && (
            <View testID="password-login-form" style={styles.form}>
              <TText testID="password-phone-label" style={styles.fieldLabel}>
                Mobile Number
              </TText>
              <View
                testID="password-phone-wrapper"
                style={[
                  styles.phoneWrapper,
                  activeInput === "phone-pw" && styles.inputFocused,
                ]}
              >
                <Ionicons
                  name="call-outline"
                  size={18}
                  color={activeInput === "phone-pw" ? C.accent : C.muted}
                  style={styles.inputIcon}
                />
                <PhoneInput
                  ref={passwordPhoneInputRef}
                  style={styles.phoneInput}
                  initialCountry="in"
                  textProps={{
                    testID: "password-phone-input",
                    placeholder: "Enter phone number",
                    placeholderTextColor: C.placeholder,
                    style: { color: C.text, fontSize: 15, flex: 1 },
                    onFocus: () => setActiveInput("phone-pw"),
                    onBlur: () => setActiveInput(null),
                  }}
                />
              </View>
              {errors.phoneNumber ? (
                <TText testID="password-phone-error" style={styles.errorText}>
                  {errors.phoneNumber}
                </TText>
              ) : null}

              {!isResetMode ? (
                <>
                  <TText testID="password-label" style={styles.fieldLabel}>
                    Password
                  </TText>
                  <View
                    testID="password-input-row"
                    style={[
                      styles.passwordRow,
                      activeInput === "password" && styles.inputFocused,
                    ]}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={activeInput === "password" ? C.accent : C.muted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      testID="password-input"
                      placeholder="Enter your password"
                      placeholderTextColor={C.placeholder}
                      style={styles.passwordField}
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setActiveInput("password")}
                      onBlur={() => setActiveInput(null)}
                    />
                    <TouchableOpacity
                      testID="toggle-password-visibility"
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={showPassword ? "eye-outline" : "eye-off-outline"}
                        size={20}
                        color={C.muted}
                      />
                    </TouchableOpacity>
                  </View>
                  {errors.password ? (
                    <TText testID="password-error" style={styles.errorText}>
                      {errors.password}
                    </TText>
                  ) : null}

                  <TouchableOpacity
                    testID="password-signin-button"
                    style={styles.primaryBtn}
                    activeOpacity={0.92}
                    onPress={handlePasswordLogin}
                  >
                    <TText testID="password-signin-button-text" style={styles.primaryBtnText}>
                      Sign In
                    </TText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="forgot-password-button"
                    style={styles.linkBtn}
                    onPress={handleForgotPassword}
                  >
                    <TText testID="forgot-password-button-text" style={styles.linkBtnText}>
                      {isSubmittingReset ? "Sending reset OTP..." : "Forgot Password?"}
                    </TText>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.resetIntro}>
                    <TText style={styles.resetIntroTitle}>Reset your password</TText>
                    <TText style={styles.resetIntroText}>
                      Enter the OTP sent to {resetPhoneNumber} and choose a new password.
                    </TText>
                  </View>

                  <TText style={styles.fieldLabel}>OTP Code</TText>
                  <TextInput
                    testID="reset-otp-input"
                    placeholder="Enter 6-digit OTP"
                    placeholderTextColor={C.placeholder}
                    style={inputStyle("reset-otp")}
                    keyboardType="numeric"
                    value={resetOtp}
                    onChangeText={setResetOtp}
                    onFocus={() => setActiveInput("reset-otp")}
                    onBlur={() => setActiveInput(null)}
                  />
                  {errors.resetOtp ? (
                    <TText testID="reset-otp-error" style={styles.errorText}>
                      {errors.resetOtp}
                    </TText>
                  ) : null}

                  <TText style={styles.fieldLabel}>New Password</TText>
                  <View
                    style={[
                      styles.passwordRow,
                      activeInput === "reset-password" && styles.inputFocused,
                    ]}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={activeInput === "reset-password" ? C.accent : C.muted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      testID="reset-new-password-input"
                      placeholder="Enter new password"
                      placeholderTextColor={C.placeholder}
                      style={styles.passwordField}
                      secureTextEntry={!showResetPassword}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      onFocus={() => setActiveInput("reset-password")}
                      onBlur={() => setActiveInput(null)}
                    />
                    <TouchableOpacity
                      onPress={() => setShowResetPassword(!showResetPassword)}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={showResetPassword ? "eye-outline" : "eye-off-outline"}
                        size={20}
                        color={C.muted}
                      />
                    </TouchableOpacity>
                  </View>
                  {errors.newPassword ? (
                    <TText testID="reset-new-password-error" style={styles.errorText}>
                      {errors.newPassword}
                    </TText>
                  ) : null}

                  <TText style={styles.fieldLabel}>Confirm Password</TText>
                  <View
                    style={[
                      styles.passwordRow,
                      activeInput === "reset-confirm-password" && styles.inputFocused,
                    ]}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={
                        activeInput === "reset-confirm-password" ? C.accent : C.muted
                      }
                      style={styles.inputIcon}
                    />
                    <TextInput
                      testID="reset-confirm-password-input"
                      placeholder="Confirm new password"
                      placeholderTextColor={C.placeholder}
                      style={styles.passwordField}
                      secureTextEntry={!showConfirmResetPassword}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={() => setActiveInput("reset-confirm-password")}
                      onBlur={() => setActiveInput(null)}
                    />
                    <TouchableOpacity
                      onPress={() =>
                        setShowConfirmResetPassword(!showConfirmResetPassword)
                      }
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={
                          showConfirmResetPassword ? "eye-outline" : "eye-off-outline"
                        }
                        size={20}
                        color={C.muted}
                      />
                    </TouchableOpacity>
                  </View>
                  {errors.confirmPassword ? (
                    <TText testID="reset-confirm-password-error" style={styles.errorText}>
                      {errors.confirmPassword}
                    </TText>
                  ) : null}

                  <TouchableOpacity
                    testID="reset-password-submit-button"
                    style={styles.primaryBtn}
                    activeOpacity={0.92}
                    onPress={handleSubmitResetPassword}
                  >
                    <TText style={styles.primaryBtnText}>
                      {isSubmittingReset ? "Resetting..." : "Reset Password"}
                    </TText>
                  </TouchableOpacity>

                  <View style={styles.resetLinkRow}>
                    <TouchableOpacity
                      testID="reset-password-resend-otp-button"
                      style={styles.linkBtnCompact}
                      onPress={handleResendResetOtp}
                    >
                      <TText style={styles.linkBtnText}>
                        {isSubmittingReset ? "Please wait..." : "Resend OTP"}
                      </TText>
                    </TouchableOpacity>

                    <TouchableOpacity
                      testID="reset-password-cancel-button"
                      style={styles.linkBtnCompact}
                      onPress={() => resetForgotPasswordState({ preservePhone: resetPhoneNumber })}
                    >
                      <TText style={styles.linkBtnText}>Back to Sign In</TText>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        <View testID="login-footer" style={styles.footer}>
          <View testID="login-footer-line" style={styles.footerLine} />
          <TText testID="login-footer-text" style={styles.footerText}>
            powered by
          </TText>
          <Image
            testID="login-footer-logo"
            source={{ uri: "https://datso.io/wp-content/uploads/2023/07/dasto_logo.png" }}
            style={styles.footerLogo}
            resizeMode="contain"
          />
        </View>
      </ScrollView>
    </>
  );
};

const createStyles = (C: {
  mode: "light" | "dark";
  bg: string;
  top: string;
  card: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  text: string;
  muted: string;
  placeholder: string;
  border: string;
  inputBg: string;
  inputFocusBg: string;
  activeTabBg: string;
  activeTabText: string;
  error: string;
  line: string;
  white: string;
  pill: string;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.bg,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingVertical: 32,
    },

    topSection: {
      paddingTop: 24,
      paddingBottom: 24,
      paddingHorizontal: 24,
      alignItems: "center",
      borderBottomLeftRadius: 36,
      borderBottomRightRadius: 36,
    },
    logoBadge: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: -6,
    },
    logo: {
      width: 220,
      height: 82,
    },

    card: {
      marginHorizontal: 18,
      backgroundColor: C.card,
      borderRadius: 24,
      padding: 22,
      shadowColor: "#000",
      shadowOpacity: 0.09,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },

    heading: {
      fontSize: 24,
      fontWeight: "800",
      color: C.text,
      marginBottom: 6,
    },
    headingBlock: {
      marginBottom: 18,
    },
    subheading: {
      fontSize: 13,
      lineHeight: 20,
      color: C.muted,
    },

    segControl: {
      flexDirection: "row",
      backgroundColor: C.pill,
      borderRadius: 14,
      padding: 4,
      marginBottom: 22,
    },
    segBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: 10,
    },
    segBtnInner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    segBtnActive: {
      backgroundColor: C.activeTabBg,
      shadowColor: "#000",
      shadowOpacity: C.mode === "dark" ? 0.18 : 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    segBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: C.muted,
    },
    segBtnTextActive: {
      color: C.activeTabText,
    },

    form: {
      width: "100%",
    },
    fieldLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: C.muted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 8,
    },

    phoneWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.inputBg,
      borderWidth: 1.4,
      borderColor: C.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 4,
      marginBottom: 16,
    },
    phoneInput: {
      flex: 1,
      height: 50,
      color: C.text,
    },
    lockedPhoneBlock: {
      backgroundColor: C.accentSoft,
      borderRadius: 16,
      padding: 14,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: C.border,
    },
    lockedPhoneHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    lockedPhoneInfoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    lockedPhoneIconBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.white,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.border,
    },
    lockedPhoneTextWrap: {
      flex: 1,
    },
    lockedPhoneTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: C.text,
      marginBottom: 4,
    },
    lockedPhoneSubtitle: {
      fontSize: 13,
      color: C.muted,
      lineHeight: 20,
    },
    changeNumberBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: C.white,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: C.border,
    },
    changeNumberBtnText: {
      color: C.accentDark,
      fontSize: 12,
      fontWeight: "700",
    },

    input: {
      backgroundColor: C.inputBg,
      borderWidth: 1.4,
      borderColor: C.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      color: C.text,
      marginBottom: 16,
    },
    passwordRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.inputBg,
      borderWidth: 1.4,
      borderColor: C.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      marginBottom: 16,
    },
    passwordField: {
      flex: 1,
      height: 50,
      fontSize: 15,
      color: C.text,
    },
    inputIcon: {
      marginRight: 8,
    },
    eyeBtn: {
      padding: 6,
    },
    inputFocused: {
      borderColor: C.accent,
      backgroundColor: C.inputFocusBg,
    },

    errorText: {
      color: C.error,
      fontSize: 12,
      marginTop: -8,
      marginBottom: 12,
      marginLeft: 2,
    },

    primaryBtn: {
      backgroundColor: C.accent,
      borderRadius: 14,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
    },
    primaryBtnText: {
      color: C.white,
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: 0.3,
    },

    linkBtn: {
      alignItems: "center",
      paddingVertical: 16,
    },
    linkBtnCompact: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      paddingHorizontal: 8,
    },
    linkBtnText: {
      color: C.accentDark,
      fontSize: 13,
      fontWeight: "700",
    },
    resetIntro: {
      backgroundColor: C.accentSoft,
      borderRadius: 16,
      padding: 14,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: C.border,
    },
    resetIntroTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: C.text,
      marginBottom: 4,
    },
    resetIntroText: {
      fontSize: 13,
      lineHeight: 20,
      color: C.muted,
    },
    resetLinkRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 8,
    },

    footer: {
      alignItems: "center",
      justifyContent: "center",
      marginTop: 24,
      paddingHorizontal: 24,
    },
    footerLine: {
      width: "100%",
      height: 1,
      backgroundColor: C.line,
      marginBottom: 14,
    },
    footerText: {
      fontSize: 11,
      color: C.muted,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginBottom: 8,
    },
    footerLogo: {
      width: 86,
      height: 26,
    },
  });

export default LoginPage;
