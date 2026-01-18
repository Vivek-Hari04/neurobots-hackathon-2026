"""
test_model.py
=============
Tests the trained IsolationForest model on new samples.
Loads the saved model and evaluates it on:
1. Held-out samples from the dataset
2. Custom suspicious samples for demonstration

Predictions:
- NORMAL: Behavior is within expected patterns
- ANOMALY: Behavior deviates significantly (potential cheating)
"""

import pandas as pd
import numpy as np
import joblib
import os

def load_model(model_path='behavior_model.pkl'):
    """
    Load the trained model, scaler, and feature columns.
    """
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"Model not found: {model_path}\n"
            "Please run train_model.py first!"
        )
    
    model_data = joblib.load(model_path)
    return model_data['model'], model_data['scaler'], model_data['feature_columns']


def predict_behavior(model, scaler, samples, feature_columns):
    """
    Predict whether samples are normal or anomalous.
    
    Returns:
    --------
    predictions : array
        1 = Normal, -1 = Anomaly
    scores : array
        Anomaly scores (lower = more anomalous)
    """
    # Ensure samples are in correct format
    if isinstance(samples, dict):
        samples = pd.DataFrame([samples])
    elif isinstance(samples, list):
        samples = pd.DataFrame(samples)
    
    # Ensure correct column order
    samples = samples[feature_columns]
    
    # Scale features
    X_scaled = scaler.transform(samples)
    
    # Get predictions and anomaly scores
    predictions = model.predict(X_scaled)
    scores = model.decision_function(X_scaled)
    
    return predictions, scores


def test_on_dataset():
    """
    Test model on samples from the original dataset.
    """
    print("\n" + "=" * 60)
    print("TESTING ON DATASET SAMPLES")
    print("=" * 60)
    
    # Load model
    model, scaler, feature_columns = load_model()
    
    # Load dataset
    df = pd.read_csv('behavior_dataset.csv')
    X = df[feature_columns]
    y_true = df['label']
    
    # Get predictions for all samples
    predictions, scores = predict_behavior(model, scaler, X, feature_columns)
    
    # Convert IsolationForest output to our labels
    # IsolationForest: 1 = normal (inlier), -1 = anomaly (outlier)
    y_pred = np.where(predictions == 1, 0, 1)  # 0 = normal, 1 = anomaly
    
    # Calculate metrics
    true_positives = np.sum((y_pred == 1) & (y_true == 1))
    true_negatives = np.sum((y_pred == 0) & (y_true == 0))
    false_positives = np.sum((y_pred == 1) & (y_true == 0))
    false_negatives = np.sum((y_pred == 0) & (y_true == 1))
    
    accuracy = (true_positives + true_negatives) / len(y_true)
    precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0
    recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    
    print(f"\nResults on full dataset ({len(df)} samples):")
    print("-" * 40)
    print(f"True Positives (cheaters detected):  {true_positives}")
    print(f"True Negatives (normal confirmed):   {true_negatives}")
    print(f"False Positives (false alarms):      {false_positives}")
    print(f"False Negatives (cheaters missed):   {false_negatives}")
    print("-" * 40)
    print(f"Accuracy:  {accuracy:.2%}")
    print(f"Precision: {precision:.2%}")
    print(f"Recall:    {recall:.2%}")
    print(f"F1-Score:  {f1:.2%}")


def test_suspicious_samples():
    """
    Test model on custom suspicious samples.
    """
    print("\n" + "=" * 60)
    print("TESTING SUSPICIOUS SAMPLES")
    print("=" * 60)
    
    # Load model
    model, scaler, feature_columns = load_model()
    
    # Create some test cases
    test_cases = [
        {
            'name': 'Normal Student (Alice)',
            'description': 'Consistent typing, minimal tab switches',
            'features': {
                'avg_key_interval': 0.2,
                'std_key_interval': 0.05,
                'typing_speed': 220,
                'backspace_rate': 0.06,
                'paste_count': 0,
                'tab_switch': 1,
                'focus_loss': 0,
                'avg_idle': 5,
                'max_idle': 15,
                'edit_count': 5,
                'time_to_first_key': 8,
                'answer_duration': 180
            }
        },
        {
            'name': 'Suspicious Student (Bob)',
            'description': 'High paste count, many tab switches',
            'features': {
                'avg_key_interval': 0.02,
                'std_key_interval': 0.25,
                'typing_speed': 750,
                'backspace_rate': 0.01,
                'paste_count': 8,
                'tab_switch': 15,
                'focus_loss': 10,
                'avg_idle': 35,
                'max_idle': 120,
                'edit_count': 1,
                'time_to_first_key': 45,
                'answer_duration': 25
            }
        },
        {
            'name': 'Normal Student (Carol)',
            'description': 'Slightly slower typing, normal behavior',
            'features': {
                'avg_key_interval': 0.25,
                'std_key_interval': 0.06,
                'typing_speed': 180,
                'backspace_rate': 0.08,
                'paste_count': 1,
                'tab_switch': 0,
                'focus_loss': 1,
                'avg_idle': 8,
                'max_idle': 25,
                'edit_count': 6,
                'time_to_first_key': 10,
                'answer_duration': 250
            }
        },
        {
            'name': 'Very Suspicious (Dave)',
            'description': 'Extreme paste behavior, no typing',
            'features': {
                'avg_key_interval': 0.01,
                'std_key_interval': 0.3,
                'typing_speed': 900,
                'backspace_rate': 0.0,
                'paste_count': 12,
                'tab_switch': 20,
                'focus_loss': 12,
                'avg_idle': 50,
                'max_idle': 150,
                'edit_count': 0,
                'time_to_first_key': 1,
                'answer_duration': 15
            }
        },
        {
            'name': 'Borderline Case (Eve)',
            'description': 'Some suspicious but explainable behavior',
            'features': {
                'avg_key_interval': 0.15,
                'std_key_interval': 0.1,
                'typing_speed': 280,
                'backspace_rate': 0.04,
                'paste_count': 2,
                'tab_switch': 4,
                'focus_loss': 2,
                'avg_idle': 12,
                'max_idle': 40,
                'edit_count': 3,
                'time_to_first_key': 5,
                'answer_duration': 150
            }
        }
    ]
    
    print("\nAnalyzing individual student behaviors:\n")
    
    for i, case in enumerate(test_cases, 1):
        features_df = pd.DataFrame([case['features']])
        predictions, scores = predict_behavior(model, scaler, features_df, feature_columns)
        
        result = "✅ NORMAL" if predictions[0] == 1 else "🚨 ANOMALY"
        score = scores[0]
        
        print(f"[{i}] {case['name']}")
        print(f"    Description: {case['description']}")
        print(f"    Prediction:  {result}")
        print(f"    Anomaly Score: {score:.4f}")
        print(f"    (Lower scores = more anomalous)")
        print()


def interactive_test():
    """
    Allow testing with custom input.
    """
    print("\n" + "=" * 60)
    print("INTERACTIVE TESTING")
    print("=" * 60)
    
    model, scaler, feature_columns = load_model()
    
    print("\nEnter your own behavior data to test:")
    print("(Press Enter to use default values)\n")
    
    defaults = {
        'avg_key_interval': 0.2,
        'std_key_interval': 0.05,
        'typing_speed': 200,
        'backspace_rate': 0.05,
        'paste_count': 0,
        'tab_switch': 1,
        'focus_loss': 0,
        'avg_idle': 5,
        'max_idle': 20,
        'edit_count': 4,
        'time_to_first_key': 10,
        'answer_duration': 150
    }
    
    sample = {}
    for feature, default in defaults.items():
        try:
            value = input(f"  {feature} [{default}]: ").strip()
            sample[feature] = float(value) if value else default
        except ValueError:
            sample[feature] = default
    
    features_df = pd.DataFrame([sample])
    predictions, scores = predict_behavior(model, scaler, features_df, feature_columns)
    
    result = "✅ NORMAL" if predictions[0] == 1 else "🚨 ANOMALY"
    
    print(f"\n{'='*40}")
    print(f"Result: {result}")
    print(f"Anomaly Score: {scores[0]:.4f}")
    print(f"{'='*40}")


def main():
    """
    Main testing pipeline.
    """
    print("=" * 60)
    print("EXAM BEHAVIOR ANOMALY DETECTION")
    print("Model Testing & Evaluation")
    print("=" * 60)
    
    # Run tests
    test_suspicious_samples()
    test_on_dataset()
    
    # Ask if user wants interactive testing
    print("\n" + "-" * 60)
    try:
        response = input("\nWould you like to test custom behavior? (y/n): ").strip().lower()
        if response == 'y':
            interactive_test()
    except (EOFError, KeyboardInterrupt):
        pass
    
    print("\n✓ Testing complete!")


if __name__ == "__main__":
    main()
