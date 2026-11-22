import AuthenticationServices
import Capacitor
import UIKit

final class AtlasViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AtlasAuthentication())
    }
}

@objc(AtlasAuthentication)
final class AtlasAuthentication: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    let identifier = "AtlasAuthentication"
    let jsName = "AtlasAuthentication"
    let pluginMethods = [CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)]

    private var session: ASWebAuthenticationSession?
    private var anchor: ASPresentationAnchor?

    @objc func authorize(_ call: CAPPluginCall) {
        guard let source = call.getString("url"), let url = URL(string: source), url.scheme == "https" else {
            call.reject("Invalid authentication URL.")
            return
        }

        DispatchQueue.main.async {
            guard self.session == nil, let window = self.bridge?.viewController?.viewIfLoaded?.window else {
                call.reject("Cannot open authentication.")
                return
            }

            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "com.solovsteam.atlas") { callback, error in
                DispatchQueue.main.async {
                    self.session = nil
                    self.anchor = nil
                    if let callback {
                        call.resolve(["callback": callback.absoluteString])
                    } else if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin {
                        call.resolve()
                    } else {
                        call.reject("Authentication did not complete.")
                    }
                }
            }

            self.session = session
            self.anchor = window
            session.presentationContextProvider = self
            if !session.start() {
                self.session = nil
                self.anchor = nil
                call.reject("Cannot start authentication.")
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        anchor ?? ASPresentationAnchor()
    }
}
