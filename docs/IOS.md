# Atlas on iPhone

The iOS target bundles the Vite build and uses the same Supabase project as the
web app. Capacitor loads the bundle in an iOS web view. The app opens Google's
sign-in page through Apple's authentication session and exchanges the returned
code for a Supabase session. Keep `com.solovsteam.atlas://auth/callback` in the
Supabase redirect URLs.

## Build locally

Use Node 24, npm and Xcode 26 or later. With the Atlas Supabase client settings
in `.env.local`, run `npm ci` and `npm run ios:prepare` from the repository root.
Open `ios/App/App.xcodeproj` and use the shared `App` scheme. The bundle ID is
`com.solovsteam.atlas`. Choose an iPhone simulator for a local check or select
the authorized Apple team for a build on a physical device.

The [Verify iOS build workflow](https://github.com/solovsteam/Atlas/actions/workflows/ios-build.yml)
can compile an unsigned build on GitHub with placeholder backend settings.

## Connect TestFlight once

1. Use Xcode to select the account holder's team under **Signing & Capabilities**.
   Register the bundle ID and create the Atlas app record under that team.
   Keep automatic signing enabled. For an individual membership, the account
   holder completes the initial Xcode setup. For an organization membership,
   a team member with the required permissions can complete the setup.
2. Start **Product > Xcode Cloud > Create Workflow** and choose the Atlas target.
   Use Apple's [guide for a repository managed by someone else](https://developer.apple.com/documentation/xcode/configuring-xcode-cloud-for-your-team#Connect-Xcode-Cloud-to-an-admin-managed-Git-repository)
   if the person setting up Xcode Cloud lacks GitHub admin access. Grant access
   to `solovsteam/Atlas` only. Save any team or workflow files that Xcode adds
   and have the Atlas maintainer commit them.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the workflow's
   environment using the project's public client settings. The post-clone
   script builds and copies the web app into the Xcode project. Start the
   workflow on changes to `main` and set the Archive action to **TestFlight
   (Internal Testing Only)**.
4. In App Store Connect, give Tonio access to Atlas and add him to an internal
   TestFlight group. Add the **TestFlight Internal Testing** post-action for
   that group so the workflow delivers new builds. Check the first signed
   build by installing Atlas with TestFlight and signing in on an iPhone.

A public App Store release is a separate workflow and requires Apple review.

[Apple's initial Xcode Cloud setup](https://developer.apple.com/documentation/xcode/configuring-your-first-xcode-cloud-workflow) ·
[Apple's TestFlight workflow guide](https://developer.apple.com/documentation/xcode/distributing-your-xcode-cloud-builds-through-testflight)
