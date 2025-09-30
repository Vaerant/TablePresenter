import json
from pymilvus import connections, Collection

CLUSTER_ENDPOINT = "url"
TOKEN = "url"

connections.connect(
    uri=CLUSTER_ENDPOINT,
    token=TOKEN 
)

collection = Collection("sermon_blocks")

# 6. Query with iterator

# Initiate an empty JSON file
with open('./export/results.json', 'w') as fp:
    fp.write(json.dumps([]))

iterator = collection.query_iterator(
    batch_size=10000,
    # expr="color_tag like \"brown_8%\"",
    output_fields=["block_uid"]
)

fetched = 0
while True:
    result = iterator.next()
    if not result:
        iterator.close()
        break
    
    fetched += len(result)
    print(f"Fetched {fetched} records so far")
    
    # Read existing records and append the returns    
    with open('./export/results.json', 'r') as fp:
        results = json.loads(fp.read())
        results += result
    
    # Save the result set    
    with open('./export/results.json', 'w') as fp:
        fp.write(json.dumps(results, indent=4))