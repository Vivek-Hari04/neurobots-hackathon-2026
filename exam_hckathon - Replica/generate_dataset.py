"""
generate_dataset.py
====================
Generates a synthetic dataset of exam behavior for anomaly detection.
Contains both NORMAL exam-taking behavior and CHEATING (anomalous) behavior.

Features generated:
- avg_key_interval: Average time between keystrokes (seconds)
- std_key_interval: Standard deviation of keystroke intervals
- typing_speed: Characters per minute
- backspace_rate: Ratio of backspaces to total keystrokes
- paste_count: Number of paste operations detected
- tab_switch: Number of tab/window switches
- focus_loss: Number of times the exam window lost focus
- avg_idle: Average idle time between actions (seconds)
- max_idle: Maximum idle time (seconds)
- edit_count: Number of answer edits/modifications
- time_to_first_key: Time from question display to first keystroke (seconds)
- answer_duration: Total time spent answering (seconds)
"""

import numpy as np
import pandas as pd

# Set random seed for reproducibility
np.random.seed(42)

def generate_normal_samples(n_samples=800):
    """
    Generate samples representing NORMAL exam-taking behavior.
    Normal students type consistently, don't switch tabs frequently,
    and don't paste content.
    """
    data = {
        # Consistent typing intervals (0.1-0.3 seconds between keys)
        'avg_key_interval': np.random.uniform(0.1, 0.3, n_samples),
        'std_key_interval': np.random.uniform(0.02, 0.08, n_samples),
        
        # Moderate typing speed (150-300 characters per minute)
        'typing_speed': np.random.uniform(150, 300, n_samples),
        
        # Low backspace rate (normal corrections)
        'backspace_rate': np.random.uniform(0.02, 0.1, n_samples),
        
        # No or minimal paste operations
        'paste_count': np.random.choice([0, 1], n_samples, p=[0.9, 0.1]),
        
        # Minimal tab switching (0-2 times)
        'tab_switch': np.random.choice([0, 1, 2], n_samples, p=[0.7, 0.2, 0.1]),
        
        # Minimal focus loss (0-1 times)
        'focus_loss': np.random.choice([0, 1], n_samples, p=[0.85, 0.15]),
        
        # Low idle time (2-10 seconds average)
        'avg_idle': np.random.uniform(2, 10, n_samples),
        
        # Maximum idle under 30 seconds
        'max_idle': np.random.uniform(5, 30, n_samples),
        
        # Moderate edit count (2-8 edits)
        'edit_count': np.random.randint(2, 9, n_samples),
        
        # Quick start (2-15 seconds to first key)
        'time_to_first_key': np.random.uniform(2, 15, n_samples),
        
        # Normal answer duration (60-300 seconds)
        'answer_duration': np.random.uniform(60, 300, n_samples),
    }
    
    df = pd.DataFrame(data)
    df['label'] = 0  # 0 = Normal
    return df


def generate_cheating_samples(n_samples=200):
    """
    Generate samples representing CHEATING behavior (anomalies).
    Cheaters often: copy-paste answers, switch tabs frequently,
    have irregular typing patterns, or long idle periods.
    """
    data = {
        # Irregular typing intervals (either too fast or too slow)
        'avg_key_interval': np.random.uniform(0.01, 0.05, n_samples),
        'std_key_interval': np.random.uniform(0.15, 0.4, n_samples),
        
        # Either very fast (copy-paste) or very slow typing
        'typing_speed': np.where(
            np.random.random(n_samples) > 0.5,
            np.random.uniform(500, 1000, n_samples),  # Suspiciously fast
            np.random.uniform(30, 80, n_samples)       # Very slow (distracted)
        ),
        
        # Low backspace rate (pasted content doesn't need corrections)
        'backspace_rate': np.random.uniform(0.0, 0.02, n_samples),
        
        # High paste count (copying answers)
        'paste_count': np.random.randint(3, 15, n_samples),
        
        # High tab switching (looking up answers)
        'tab_switch': np.random.randint(5, 25, n_samples),
        
        # Frequent focus loss
        'focus_loss': np.random.randint(3, 15, n_samples),
        
        # Higher idle times (reading external sources)
        'avg_idle': np.random.uniform(20, 60, n_samples),
        
        # Very long maximum idle (stepping away or using phone)
        'max_idle': np.random.uniform(60, 180, n_samples),
        
        # Low edit count (pasted answers aren't edited much)
        'edit_count': np.random.randint(0, 2, n_samples),
        
        # Either very quick (had answer ready) or very slow start
        'time_to_first_key': np.where(
            np.random.random(n_samples) > 0.5,
            np.random.uniform(0.5, 2, n_samples),   # Suspiciously quick
            np.random.uniform(30, 90, n_samples)    # Very slow start
        ),
        
        # Either very short (quick paste) or very long duration
        'answer_duration': np.where(
            np.random.random(n_samples) > 0.5,
            np.random.uniform(10, 30, n_samples),   # Too quick
            np.random.uniform(400, 600, n_samples)  # Too long
        ),
    }
    
    df = pd.DataFrame(data)
    df['label'] = 1  # 1 = Cheating/Anomaly
    return df


def main():
    """
    Main function to generate and save the complete dataset.
    """
    print("=" * 60)
    print("EXAM BEHAVIOR DATASET GENERATOR")
    print("=" * 60)
    
    # Generate samples
    print("\n[1/3] Generating normal behavior samples...")
    normal_df = generate_normal_samples(n_samples=800)
    print(f"      Generated {len(normal_df)} normal samples")
    
    print("\n[2/3] Generating cheating behavior samples...")
    cheating_df = generate_cheating_samples(n_samples=200)
    print(f"      Generated {len(cheating_df)} cheating samples")
    
    # Combine and shuffle
    print("\n[3/3] Combining and shuffling dataset...")
    full_dataset = pd.concat([normal_df, cheating_df], ignore_index=True)
    full_dataset = full_dataset.sample(frac=1, random_state=42).reset_index(drop=True)
    
    # Save to CSV
    output_file = 'behavior_dataset.csv'
    full_dataset.to_csv(output_file, index=False)
    
    # Print summary
    print("\n" + "=" * 60)
    print("DATASET SUMMARY")
    print("=" * 60)
    print(f"\nTotal samples: {len(full_dataset)}")
    print(f"Normal samples: {len(full_dataset[full_dataset['label'] == 0])}")
    print(f"Cheating samples: {len(full_dataset[full_dataset['label'] == 1])}")
    print(f"\nFeatures: {list(full_dataset.columns[:-1])}")
    print(f"\nDataset saved to: {output_file}")
    
    # Show sample statistics
    print("\n" + "=" * 60)
    print("SAMPLE STATISTICS (First 5 features)")
    print("=" * 60)
    print(full_dataset.describe().iloc[:, :5].round(3))
    
    print("\n✓ Dataset generation complete!")


if __name__ == "__main__":
    main()
