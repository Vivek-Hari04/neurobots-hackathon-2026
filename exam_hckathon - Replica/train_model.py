"""
train_model.py
==============
Trains an IsolationForest model for detecting anomalous exam behavior.

IsolationForest is an unsupervised anomaly detection algorithm that works by:
1. Building an ensemble of isolation trees
2. Each tree isolates observations by random feature selection and splits
3. Anomalies are easier to isolate, requiring fewer splits
4. Points that require fewer splits to isolate are considered anomalies

We train ONLY on normal samples, so the model learns what "normal" looks like.
During testing, samples that deviate from normal patterns are flagged as anomalies.
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib
import os

def load_and_prepare_data(filepath='behavior_dataset.csv'):
    """
    Load the dataset and prepare it for training.
    Returns only NORMAL samples for training (unsupervised approach).
    """
    print(f"Loading dataset from {filepath}...")
    
    if not os.path.exists(filepath):
        raise FileNotFoundError(
            f"Dataset not found: {filepath}\n"
            "Please run generate_dataset.py first!"
        )
    
    df = pd.read_csv(filepath)
    
    # Separate features and labels
    feature_columns = [col for col in df.columns if col != 'label']
    X = df[feature_columns]
    y = df['label']
    
    # For training, use ONLY normal samples (label == 0)
    # This is the key to anomaly detection: learn normal, detect deviations
    X_normal = X[y == 0]
    
    print(f"Total samples in dataset: {len(df)}")
    print(f"Normal samples for training: {len(X_normal)}")
    print(f"Features: {feature_columns}")
    
    return X_normal, feature_columns


def train_isolation_forest(X_train, contamination=0.05):
    """
    Train an IsolationForest model on normal data.
    
    Parameters:
    -----------
    X_train : DataFrame
        Training data containing only normal samples
    contamination : float
        Expected proportion of anomalies in the dataset (used for threshold)
        Set lower since we're training on clean data
    
    Returns:
    --------
    model : IsolationForest
        Trained model
    scaler : StandardScaler
        Fitted scaler for feature normalization
    """
    print("\nPreparing features...")
    
    # Standardize features for better model performance
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)
    
    print("Training IsolationForest model...")
    print(f"  - n_estimators: 100 (number of trees)")
    print(f"  - contamination: {contamination} (expected anomaly ratio)")
    print(f"  - max_samples: 'auto' (samples per tree)")
    print(f"  - random_state: 42 (for reproducibility)")
    
    # Initialize and train the model
    model = IsolationForest(
        n_estimators=100,      # Number of trees in the forest
        contamination=contamination,  # Expected proportion of outliers
        max_samples='auto',    # Number of samples to draw
        max_features=1.0,      # Features to use per tree
        bootstrap=False,       # Sample without replacement
        random_state=42,       # Reproducibility
        n_jobs=-1,             # Use all CPU cores
        verbose=0
    )
    
    model.fit(X_scaled)
    print("Training complete!")
    
    return model, scaler


def evaluate_on_training_data(model, scaler, X_train):
    """
    Quick evaluation on training data to verify model.
    """
    print("\nEvaluating on training data...")
    
    X_scaled = scaler.transform(X_train)
    predictions = model.predict(X_scaled)
    
    # IsolationForest: 1 = normal, -1 = anomaly
    n_normal = np.sum(predictions == 1)
    n_anomaly = np.sum(predictions == -1)
    
    print(f"  Normal training samples classified as normal: {n_normal}")
    print(f"  Normal training samples classified as anomaly: {n_anomaly}")
    print(f"  (Some false positives expected due to contamination parameter)")


def save_model(model, scaler, feature_columns):
    """
    Save the trained model, scaler, and feature names.
    """
    model_data = {
        'model': model,
        'scaler': scaler,
        'feature_columns': feature_columns
    }
    
    output_file = 'behavior_model.pkl'
    joblib.dump(model_data, output_file)
    print(f"\nModel saved to: {output_file}")
    
    return output_file


def main():
    """
    Main training pipeline.
    """
    print("=" * 60)
    print("ISOLATION FOREST TRAINING")
    print("Exam Behavior Anomaly Detection")
    print("=" * 60)
    
    # Step 1: Load and prepare data
    print("\n[Step 1/4] Loading dataset...")
    X_normal, feature_columns = load_and_prepare_data()
    
    # Step 2: Train the model
    print("\n[Step 2/4] Training model...")
    model, scaler = train_isolation_forest(X_normal)
    
    # Step 3: Quick evaluation
    print("\n[Step 3/4] Evaluating model...")
    evaluate_on_training_data(model, scaler, X_normal)
    
    # Step 4: Save model
    print("\n[Step 4/4] Saving model...")
    save_model(model, scaler, feature_columns)
    
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)
    print("\nThe model has learned normal exam behavior patterns.")
    print("It will flag samples that deviate from these patterns as anomalies.")
    print("\nNext step: Run test_model.py to test the model.")
    print("\n✓ Training pipeline complete!")


if __name__ == "__main__":
    main()
