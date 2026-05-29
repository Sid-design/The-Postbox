This is a [React Native](https://reactnative.dev) application bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> [!NOTE]
> **Current Status:** The project is configured for cloud builds using EAS. The first build for iOS is currently **blocked** pending approval of the required Apple Developer Program membership. UI development is proceeding in the meantime.

> [!IMPORTANT]
> This project is developed with an **iOS-first** strategy. To build and test the app on a physical iOS device from a Windows development machine, we use **Expo Application Services (EAS) Build**.

## Theming and UI

The application supports both light and dark modes and will automatically adapt to the user's system settings. This is achieved through a centralized theming architecture built on top of React Navigation's theming capabilities.

### Architecture

1.  **Color Palette (`src/theme.ts`):** Defines the core color values for both `light` and `dark` themes. This is the single source of truth for all colors used in the application.

2.  **Navigation Theme (`src/navigation/navigationTheme.ts`):** This file adapts the application's color palette to the theme structure required by `react-navigation`. It creates two themes, `light` and `dark`, that control the appearance of navigation elements like headers, tabs, and screen backgrounds.

3.  **Theme Provider (`App.tsx`):** The root component, `App.tsx`, detects the user's system-wide color scheme (light or dark) using the `useColorScheme` hook. It then passes the corresponding theme from `navigationTheme.ts` to the `NavigationContainer`. This makes the theme available to all screens and components within the navigation stack.

4.  **Component-Level Styling (`useTheme`):** Individual screens and components use the `useTheme` hook from `@react-navigation/native` to access the currently active theme's colors. This ensures that all UI elements, from backgrounds to text and buttons, dynamically update their appearance to match the selected theme.

This approach ensures a consistent look and feel across the entire application and simplifies the process of adding new themed components.

## 1. Prerequisites

Before you can build the app, you will need the following:

- An **[Expo account](https://expo.dev/signup)**.
- An **[Apple Developer Program](https://developer.apple.com/programs/enroll/)** membership. This is required by Apple to sign and install apps onto a physical device.
- The **[Expo Go](https://expo.dev/go)** app installed on your iPhone.

## 2. Install Dependencies

Navigate to this directory and install the required Node.js packages:

```sh
npm install
```

## 3. Build and Run the Application

This project uses a **custom development client**. This is a special version of the Expo Go app that includes the specific native libraries used by our project.

### Creating a Development Build

1.  **Log in to your Expo account:**
    ```sh
    npx eas login
    ```
2.  **Configure the build:**
    The first time you build, you will be prompted to configure the project. Follow the on-screen instructions. This will create an `eas.json` file.
    ```sh
    npx eas build:configure --platform ios
    ```
3.  **Start the build:**
    This command will upload your project to the EAS servers and begin the build process on a cloud-based macOS machine.
    ```sh
    npx eas build --profile development --platform ios
    ```
4.  **Install the app:**
    When the build is complete, EAS will provide a link and a QR code. Scan the QR code with your iPhone to install the custom development client.

### Starting the Development Server

Once the custom client is installed on your phone:

1.  **Start the Metro development server:**
    ```sh
    npm start
    ```
2.  **Open the app:**
    Scan the QR code from the Metro terminal with your iPhone's camera. This will open the project inside your newly installed development client.
