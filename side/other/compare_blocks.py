import json
import sqlite3
from collections import Counter

def fetch_sqlite_blocks_chunked(db_path, chunk_size=25000):
    """Fetch blocks from SQLite in chunks"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get total count first
    cursor.execute("SELECT COUNT(*) FROM blocks WHERE embedding IS NOT NULL AND uid NOT LIKE '%-b0'")
    total_count = cursor.fetchone()[0]
    print(f"Total blocks in SQLite: {total_count}")
    
    all_uids = set()
    offset = 0
    
    while offset < total_count:
        cursor.execute(
            "SELECT uid FROM blocks WHERE embedding IS NOT NULL AND uid NOT LIKE '%-b0' LIMIT ? OFFSET ?",
            (chunk_size, offset)
        )
        
        chunk_uids = {row[0] for row in cursor.fetchall()}
        all_uids.update(chunk_uids)
        
        offset += chunk_size
        print(f"Fetched {min(offset, total_count)} / {total_count} records from SQLite")
    
    conn.close()
    return all_uids

def load_zilliz_results(json_path):
    """Load block UIDs from exported results"""
    try:
        with open(json_path, 'r') as fp:
            results = json.load(fp)
        
        # Extract block_uid values
        zilliz_uids = [record.get('block_uid') for record in results if 'block_uid' in record]
        print(f"Total records in Zilliz export: {len(zilliz_uids)}")
        
        return zilliz_uids
    except FileNotFoundError:
        print(f"Export file {json_path} not found!")
        return []

def compare_datasets(sqlite_uids, zilliz_uids):
    """Compare SQLite and Zilliz datasets"""
    sqlite_set = set(sqlite_uids)
    zilliz_counter = Counter(zilliz_uids)
    zilliz_set = set(zilliz_uids)
    
    # Find missing records (in SQLite but not in Zilliz)
    missing_in_zilliz = sqlite_set - zilliz_set
    
    # Find extra records (in Zilliz but not in SQLite)
    extra_in_zilliz = zilliz_set - sqlite_set
    
    # Find duplicates in Zilliz
    duplicates = {uid: count for uid, count in zilliz_counter.items() if count > 1}
    
    return {
        'missing_in_zilliz': missing_in_zilliz,
        'extra_in_zilliz': extra_in_zilliz,
        'duplicates': duplicates,
        'sqlite_count': len(sqlite_set),
        'zilliz_count': len(zilliz_uids),
        'zilliz_unique_count': len(zilliz_set)
    }

def save_comparison_results(comparison, output_dir='./export'):
    """Save comparison results to JSON files"""
    import os
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Save missing records
    with open(f'{output_dir}/missing_in_zilliz.json', 'w') as fp:
        json.dump(list(comparison['missing_in_zilliz']), fp, indent=4)
    
    # Save extra records
    with open(f'{output_dir}/extra_in_zilliz.json', 'w') as fp:
        json.dump(list(comparison['extra_in_zilliz']), fp, indent=4)
    
    # Save duplicates
    with open(f'{output_dir}/duplicates_in_zilliz.json', 'w') as fp:
        json.dump(comparison['duplicates'], fp, indent=4)
    
    # Save summary
    summary = {
        'sqlite_total': comparison['sqlite_count'],
        'zilliz_total': comparison['zilliz_count'],
        'zilliz_unique': comparison['zilliz_unique_count'],
        'missing_count': len(comparison['missing_in_zilliz']),
        'extra_count': len(comparison['extra_in_zilliz']),
        'duplicate_count': len(comparison['duplicates']),
        'total_duplicate_records': sum(comparison['duplicates'].values()) - len(comparison['duplicates'])
    }
    
    with open(f'{output_dir}/comparison_summary.json', 'w') as fp:
        json.dump(summary, fp, indent=4)
    
    return summary

def main():
    # Configuration
    sqlite_db_path = './sermons.db'  # Update this path
    zilliz_export_path = './export/results.json'
    
    print("Starting comparison process...")
    
    # Fetch data from SQLite
    print("\n1. Fetching blocks from SQLite...")
    sqlite_uids = fetch_sqlite_blocks_chunked(sqlite_db_path, chunk_size=25000)
    
    # Load Zilliz export
    print("\n2. Loading Zilliz export...")
    zilliz_uids = load_zilliz_results(zilliz_export_path)
    
    # Compare datasets
    print("\n3. Comparing datasets...")
    comparison = compare_datasets(sqlite_uids, zilliz_uids)
    
    # Save results
    print("\n4. Saving comparison results...")
    summary = save_comparison_results(comparison)
    
    # Print summary
    print("\n" + "="*50)
    print("COMPARISON SUMMARY")
    print("="*50)
    print(f"SQLite total blocks:      {summary['sqlite_total']:,}")
    print(f"Zilliz total records:     {summary['zilliz_total']:,}")
    print(f"Zilliz unique records:    {summary['zilliz_unique']:,}")
    print(f"Missing in Zilliz:        {summary['missing_count']:,}")
    print(f"Extra in Zilliz:          {summary['extra_count']:,}")
    print(f"Duplicate UIDs:           {summary['duplicate_count']:,}")
    print(f"Total duplicate records:  {summary['total_duplicate_records']:,}")
    print("\nResults saved to ./export/ directory")
    
    if summary['missing_count'] > 0:
        print(f"\n⚠️  {summary['missing_count']} blocks are missing from Zilliz!")
    
    if summary['duplicate_count'] > 0:
        print(f"\n⚠️  {summary['duplicate_count']} UIDs have duplicates in Zilliz!")
    
    if summary['missing_count'] == 0 and summary['duplicate_count'] == 0 and summary['extra_count'] == 0:
        print("\n✅ Datasets are perfectly synchronized!")

if __name__ == "__main__":
    main()