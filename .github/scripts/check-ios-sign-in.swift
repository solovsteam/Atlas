import Foundation
import Vision

let request = VNRecognizeTextRequest()
request.recognitionLevel = .fast
try VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1])).perform([request])
let text = request.results?.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ") ?? ""
guard text.localizedCaseInsensitiveContains("Sign in with Google") else {
    print("Waiting for the Atlas sign-in screen. Visible text: \(text)")
    exit(1)
}
print(text)
