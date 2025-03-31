import sys
import torch
from transformers import BertTokenizer, BertForSequenceClassification, RobertaTokenizer, RobertaForSequenceClassification
from collections import Counter

# Device configuration
DEVICE = torch.device("mps" if torch.cuda.is_available() else "cpu")

# Keep eval_one exactly as provided
def eval_one(model, tokenizer, contract):
    '''
    Evaluate a single contract
    '''
    model.eval()
    tokenized_code = tokenizer.encode(contract)
    prompts = []
    cur_idx = 0
    while cur_idx < len(tokenized_code):
        prompts.append(tokenized_code[cur_idx:cur_idx+512])
        cur_idx += 512
    prompts = torch.nn.utils.rnn.pad_sequence([torch.tensor(x) for x in prompts], batch_first=True, padding_value=1)
    with torch.no_grad():
        outputs = model(input_ids=prompts.to(DEVICE))
        logits = outputs.logits
        predicted_class = logits.argmax(dim=1)
        
    from collections import Counter
    c = Counter(predicted_class.cpu().numpy().tolist())
    most_commons = c.most_common(2)
    first = most_commons[0][0]
    if first == 0 and most_commons[0][1] < len(predicted_class.cpu().numpy().tolist()):
        return most_commons[1][0]

    return first

if __name__ == "__main__":
    try:
        # Load model and tokenizer based on provided model name
        model_name = sys.argv[2] if len(sys.argv) > 2 else "bert-base-uncased"
        print(f"Loading model: {model_name}")
        
        # Load the tokenizer and model in the new way
        tokenizer = RobertaTokenizer.from_pretrained("microsoft/codebert-base")
        model = RobertaForSequenceClassification.from_pretrained("models/CodeBERT-solidifi_final").to(DEVICE)
        model.eval()

        # Get the query (contract code) from command-line arguments
        query = sys.argv[1]

        # Get the prediction using eval_one
        prediction = eval_one(model, tokenizer, query)
        
        REF_LABELS = {
            "NO-VULNERABILITIES": 0,
            "OVERFLOW-UNDERFLOW": 1,
            "RE-ENTRANCY": 2,
            "TIMESTAMP-DEPENDENCY": 3,
            "TOD": 4,
            "TX.ORIGIN": 5,
            "UNCHECKED-SEND": 6,
            "UNHANDLED-EXCEPTIONS": 7,
        }

        # Assuming prediction is an integer (e.g., 2)
        # Reverse the dictionary to map integers to vulnerability types
        reverse_ref_labels = {v: k for k, v in REF_LABELS.items()}

        # Check if the prediction is a valid label
        if prediction in reverse_ref_labels:
            print(reverse_ref_labels[prediction])
        else:
            print(f"Invalid prediction value: {prediction}")

    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)